# LH/FSH — dane, zapis kontekstu i interfejs, PR1–PR3

Stan dokumentu: 9 października 2026. Baza PR1: `audyt` `68993e35`; baza PR2 po scaleniu #528: `ad84e67b`; baza poprawek kontekstu klinicznego: `a347eac8`. Sekcje z wcześniejszymi datami dokumentują kolejne wersje; aktualny zakres formularza opisano poniżej.

## Przygotowanie profilu wcześniaczego — 9.10.2026

**Status: przygotowane dane, bez aktywacji interpretacji.** Dodano osobne profile
`greaves-preterm-lh-candidate` i `greaves-preterm-fsh-candidate`, wersja `2026-10-09.1`.
Każdy ma `active: false`, puste `rows` i brak `scope`. Liczby są wyłącznie w
`reportedIntervals`; nie stanowią danych wejściowych do porównania stężenia.
Samo przełączenie `active` nie wystarcza do użycia tych profili.

Podstawa: Greaves RF i wsp., *Hormone Modeling in Preterm Neonates: Establishment
of Pituitary and Steroid Hormone Reference Intervals*, JCEM 2015;100:1097–1103,
[PMID 25562509](https://pubmed.ncbi.nlm.nih.gov/25562509/),
[DOI 10.1210/jc.2014-3681](https://doi.org/10.1210/jc.2014-3681).
Odczyt 9.10.2026: abstrakt artykułu oraz pełny
[poster autorów IFCC EuroMedLab Paris 2015](https://www.researchgate.net/publication/280581071_Hormone_modelling_in_preterm_neonates_establishment_of_pituitary_and_steroid_hormone_reference_intervals_Poster_Abstract_-_IFCC_EuroMedLab_Paris_2015_21-25_June_2015_Clin_Chem_Lab_Med_2015_53_Special_),
z weryfikacją obrazu tabeli „Hormone 95% Reference Intervals”. **Pełny artykuł
i suplement nie były dostępne**; nie deklarujemy zgodności tabeli posteru z finalną
tabelą artykułu. Odczytane corrigenda
[10.1210/jc.2016-1639](https://academic.oup.com/jcem/article/101/5/2265/2804857) i
[10.1210/jc.2016-2005](https://academic.oup.com/jcem/article/101/6/2622/2804884)
dotyczą podziękowań i jednostki prolaktyny, nie granic LH/FSH.

Rekrutowano 248 noworodków (128 chłopców, 120 dziewczynek) z trzech oddziałów
intensywnej terapii w Melbourne, urodzonych w 24.–32. tygodniu ciąży. Potwierdzone
kryteria: brak niejednoznacznych genitaliów/innych zaburzeń endokrynologicznych
i przeżycie do wieku odpowiadającego terminowi. Materiał: surowica. Statystyka:
centralny 95% przedział referencyjny, metoda robust po transformacji Box–Cox.
Liczebności poniżej dotyczą tabeli LH/FSH, nie całej rekrutowanej kohorty.

| Analit | Chłopcy (n=111) | Dziewczynki (n=108) |
|---|---:|---:|
| LH, IU/L | 0,1–9,2 | 0,2–134 |
| FSH, IU/L | 0,16–3,6 | 2,6–181 |

**Braki blokujące aktywację:** dokładne dni życia przy pobraniu i reguły wieku
postmenstruacyjnego, granice tygodni/dni wieku ciążowego, pełne kryteria kliniczne
(w tym leczenie), finalna tabela oraz identyfikacja oznaczenia. Abstrakt wskazuje
Roche Cobas 8000-e601, poster 8000-E602; zgodność wersji odczynników/kalibracji
i przenoszalność na aktualne profile Mayo nie są potwierdzone. FSH w części próbek
przekraczało liniowość 200 IU/L — sposób obsługi wymaga pełnego artykułu.
Nie tworzymy kryteriów ze średniego wieku kohorty, nie przejmujemy 0–43 dni
z pilotażu Greaves 2008 ani harmonogramu innego badania z 2014 r.

**Wpływ na aplikację:** brak nowych pól i opcji metody; wyniki i interpretacje
pozostają niezmienione. Profile nie są wybieralne, zapisywalne jako ustawienie
urządzenia ani używane w `referencePreview`. Dotychczasowa blokada użycia norm Mayo
u wcześniaka pozostaje. Istnienie norm w literaturze nie oznacza ich dopasowania
do każdego wcześniaka i całego pierwszego roku życia. Silnik `1.3.0`, wersje profili
Mayo/Johannsen, polityka biochemiczna i kryteria kliniczne pozostają bez zmian;
wersja zbioru danych wynosi teraz `2026-10-09.1`. Stare snapshoty nie są migrowane
ani ponownie liczone. Greaves nie jest dopisywany do źródeł zwykłych ocen Mayo.

Przypadki dla rzeczywistych funkcji produkcyjnych:

| Wejście/działanie | Oczekiwany wynik |
|---|---|
| LH/FSH, wskazanie kandydata Greaves, M/F, wiek i wynik znane | Brak porównania i podglądu; `profile_not_active`; bez zastąpienia normą Mayo. |
| Próba zapisania konfiguracji kandydata lub odczyt takiej konfiguracji | Kandydat odrzucony; nie pojawia się jako zapamiętana metoda. |
| Wcześniak, dotychczasowa metoda Mayo | Nadal brak niedopasowanego RI, bez automatycznego przejścia na tabelę posteru. |
| M, 2 lata 9 miesięcy, G3, LH2 IU/L, zgodna metoda Mayo | Dotychczasowe porównania: powyżej dla wieku, w zakresie dla G3; ostrzeżenie wczesnego rozwoju pozostaje. |
| Odczyt starszej oceny | Pierwotne wartości, statusy, źródła i wersje bez ponownego obliczenia. |

Plan aktywacji: pełny artykuł i suplement → rozstrzygnięcie wszystkich kryteriów
oraz metody → jawne reguły kwalifikacji GA/PNA w danych → testy granic i doboru
populacji → akceptacja kliniczna właściciela. Dopiero wtedy należy projektować
minimalne uzupełnienie danych niemowlęcia. Obecny wiek w latach/miesiącach nie
może udawać dokładnej liczby dni życia. Ten etap przygotowania nie stanowi
walidacji klinicznej ani aktywacji nowych norm.

## Przyciski edycji i animacje — 9.10.2026

Formularz `1.10.0` i renderer `1.7.0` usuwają przycisk „Zatrzymaj/Wznów animacje” oraz stan ręcznej pauzy. Dotychczasowe pulsowanie wyniku, drżenie znacznika, wykrzyknik i etykieta znacznego odchylenia pozostają. Systemowa preferencja `prefers-reduced-motion` i wydruk nadal wyłączają ruch; unieważniona poprzednia ocena pozostaje statyczna. Przyciski „Zmień”, „Zmień stadium” i „Doprecyzuj” korzystają z kolorów i obramowań przelicznika, widocznego fokusu i pola dotyku co najmniej 44 px na telefonie. Układ formularza i działanie edycji pozostają dotychczasowe.

**Wpływ kliniczny: brak zmiany obliczeń i interpretacji.** Usunięto sterowanie prezentacją, bez zmiany progów wyróżnienia, tekstu ostrzeżeń, norm, silnika `1.3.0`, danych/kryteriów `2026-10-04.1` ani zapisanych ocen. Obowiązują dotychczasowe źródła, populacje i jednostki R1/R2 oraz ograniczenia opisane poniżej. Regresja na rzeczywistym rendererze: M2 lata 9 miesięcy/G3/LH2 IU/L ze zgodną metodą → dotychczasowe warunkowe porównania wieku i stadium oraz `early_development`; brak przełącznika ruchu; ograniczenie ruchu w systemie lub wydruk → te same ostrzeżenia i wykrzyknik bez animacji.

## Uproszczenie etykiet i szczegółów oceny — 9.10.2026

**Zakres zmiany:** wynik zachowuje osobną ocenę rozwoju oraz osie wieku i stadium. Rozwijany blok nosi nazwę „Szczegóły i źródła”. Usunięto całą tabelę „Kontekst użyty w ocenie”, powtarzający ją opis kontekstu oraz techniczne wersje silnika, danych i profili z prezentacji wyniku, również przy odczycie ocen historycznych. Szczegóły zawierają krótką informację o metodzie, źródłach i istotnych ograniczeniach, bez audytowego wyliczania danych wejściowych. Wersje i pozostałe metadane nadal należą do danych oceny; uproszczenie ekranu ich nie usuwa.

**Brak wyniku i błąd wyniku to różne stany.** Puste pole nie otrzymuje komunikatu „Nieprawidłowy zapis wyniku lub jednostki”. Niepusty błędny zapis wymaga poprawienia, ale powód nie jest powtarzany w podsumowaniu i osobno pod każdym niedostępnym porównaniem. Niezależne, znane ostrzeżenie kliniczne pozostaje widoczne także wtedy, gdy liczba nie została jeszcze podana lub jest błędna. Brak wiarygodnego wieku nie jest przedstawiany jednocześnie jako stwierdzenie, że wiek leży poza populacją profilu.

**Kontekst i ograniczenia:** usunięcie tabeli obejmuje zarówno wartości puste/nieznane, jak i znane daty, odpowiedzi „Tak”/„Nie”, objętości oraz inne pola dawnego kontekstu. Nie odtwarzamy tabeli dla starszych zapisów ani nie przenosimy jej do innej części wyniku. Nie oznacza to zamiany `unknown` na „Nie” ani usunięcia danych. Ostrzeżenia kliniczne nadal pochodzą z oceny, a powody ograniczeń są zbierane według ich kodów do jednej listy. Przy braku historycznego wejścia `localReference` nie jest pokazywana pusta sekcja „Zakres laboratorium” ani komunikat `no_local_reference`.

Uproszczenie nie ukrywa ograniczeń związanych ze znanym leczeniem lub stymulacją, zastrzeżenia, że niskie LH nie wyklucza CPP, ograniczeń minipuberty i wcześniactwa ani przyczyn niejednoznaczności wyników cenzorowanych. Warunek porównania z zakresami **bazalnymi bez leczenia hormonalnego** pozostaje czytelny przy porównaniach warunkowych. Wynik `<x`, `≤x`, `>x`, `≥x`, `<LOD` lub `<LOQ` nadal zachowuje operator i nie otrzymuje wymyślonego dokładnego punktu. Zgodność stężenia ze stadium nadal nie oznacza prawidłowego czasu rozwoju ani nie ustala jego przyczyny.

**Wpływ kliniczny: TAK — zmiana prezentacji ograniczeń i hierarchii informacji.** Nie zmieniają się dane wejściowe, dobór norm, granice, jednostki, statusy oceny ani reguły animowanych wyróżnień. Silnik `1.3.0`, dane i kryteria `2026-10-04.1` oraz kontrakt snapshotu pozostają niezmienione. Zapisane oceny nie są migrowane ani ponownie liczone. Ich odczyt korzysta z prostszego widoku bez tabeli kontekstu, zachowując utrwalone ostrzeżenia i ograniczenia. Historyczny `reportedRange`, konflikt porównań oraz `localReference` nadal są obsługiwane, ale wersje lokalnego profilu także nie są wyświetlane. Pełne dane kontekstu, pochodzenie i wersje pozostają w snapshocie i publicznym modelu odczytu, bez mutacji.

**Źródła, populacja i jednostki:** bez nowych założeń medycznych i bez nowego odczytu piśmiennictwa. Obowiązują dotychczasowe katalogi Mayo LH LHPED 62999 (AnshLite CLIA) [R1] i FSH 602753 (Roche Elecsys ECLIA) [R2], odczytane 2–3.10.2026: surowica, IU/L i równoważne mIU/mL, ograniczenia wieku, płci, stadium i populacji konkretnego profilu. Model kliniczny pozostaje pediatryczny 0–18 lat. Rozdzielenie stężenia i rozwoju oraz ograniczenia leczenia/stymulacji opierają się na dotychczasowych K1–K4; ograniczenia niemowlęce na M1, a definicja wcześniactwa na K6. Pełne cytowania, wersje dokumentów i rzeczywisty zakres wcześniejszego odczytu pozostają w [wykazie źródeł](#źródła-i-rzeczywisty-zakres-odczytu). Decyzja o redukcji etykiet jest decyzją funkcjonalną właściciela, nie zaleceniem wynikającym z tych publikacji.

Syntetyczne przypadki wymagane dla rzeczywistego silnika i renderera:

| Wejście lub działanie | Oczekiwany widok |
|---|---|
| Pusta wartość LH, nieznany wiek, skonfigurowana metoda | Brak fałszywego błędu zapisu, powielonych list i pustego zakresu laboratorium; brak wieku nie udaje wieku poza profilem. |
| Niepusty błędny zapis wyniku lub nieobsługiwana jednostka | Jeden właściwy komunikat poprawienia danych; brak porównania liczbowego i jego wielokrotnie powtórzonych przyczyn. |
| M, 2 lata 9 miesięcy, G3, LH2 IU/L, zgodna metoda, leczenie nieznane | Nadal warunkowo `above` dla wieku (`≤0,5`), `within` dla G3 (`0,09–4,2`), ostrzeżenie `early_development` i dotychczasowe wyróżnienie odchylenia. |
| Ten sam wczesny rozwój przy pustej lub błędnej wartości LH | Znane ostrzeżenie rozwoju nie znika razem z niedostępnym porównaniem stężenia. |
| Jawne leczenie/stymulacja, niemowlę z wcześniactwem lub wynik `<LOD` | Właściwe ograniczenia pozostają, bez niedopasowanego zakresu lub dokładnego punktu wyniku cenzorowanego. |
| Wcześniejszy snapshot z datami, OUN/regresją, jawnym „Nie”, początkiem rozwoju lub `localReference` | Brak tabeli kontekstu i technicznych wersji także w historii; utrwalone ostrzeżenia i porównania pozostają. Pełne dane w zapisie i publicznym modelu odczytu są niezmienione, bez ponownego liczenia. |

Przypadki opisują oczekiwania regresyjne; wyniki wykonania testów są raportowane w PR. Zmiana wymaga przeglądu klinicznego właściciela ze względu na sposób odczytu ograniczeń, a testy techniczne nie stanowią walidacji klinicznej.

## Usunięcie ręcznego zakresu z bieżącego formularza — 8.10.2026

**Zakres zmiany:** szybki formularz nie udostępnia już zakładki „Zakres z wydruku”, pola granic ani podpowiedzi jednostki tego pola. Pozostają sekcje „Pacjent” i „Stadium”, zgodna konfiguracja oznaczenia oraz bieżący kontekst opisany w poprzedniej wersji poniżej. Użytkownik nie musi przepisywać przedziału, który może odczytać bezpośrednio z wydruku laboratorium. To decyzja o uproszczeniu funkcji, nie nowe zalecenie medyczne.

**Wpływ kliniczny:** nowe sprawdzenie nie tworzy `input.reportedRange` ani `evaluation.reportedRange`. Nie daje dodatkowej klasyfikacji „w/powyżej/poniżej podanego zakresu” ani komunikatu `reported_range_reference_disagreement` wywołanego rozbieżnością ręcznego zakresu z katalogiem. Automatyczne porównania wieku i stadium, ich osie i wyróżnienia oraz niezależna ocena rozwoju pozostają na dotychczasowych zasadach. Minimalne wejście ze zgodną metodą nadal korzysta z warunkowego `referencePreview`; usunięcie pola nie potwierdza oznaczenia bazalnego ani braku leczenia. Przy nieznanej lub niezgodnej metodzie nadal nie ma katalogowej oceny stężenia. Dostępne pozostają konwersja i ocena rozwoju w granicach znanego kontekstu; aplikacja nie zastępuje brakującej metody zgadywaną normą.

**Zgodność zapisów:** usunięto wyłącznie drogę wprowadzania ręcznego zakresu w bieżącym UI. Publiczny `buildInput` nadal przyjmuje jawny `reportedRange` starszego klienta, a produkcyjny silnik, renderer i kontrakt snapshotu zachowują jego dotychczasową obsługę. Wizyty, przypięte wyniki i historia pokazują utrwalony zakres, porównanie i ewentualny konflikt, bez migracji, filtrowania lub ponownego obliczania. Te dane nie są automatycznie przenoszone do nowego sprawdzenia. `reportedRange` pozostaje odrębny od pełnego, zweryfikowanego `localReference`.

**Źródła, populacja i jednostki:** bez zmian w silniku `1.3.0`, danych i kryteriach `2026-10-04.1`, profilach, progach i przeliczeniach. Obowiązują katalogi Mayo LH LHPED 62999 (AnshLite CLIA) [R1] i FSH 602753 (Roche Elecsys ECLIA) [R2], odczytane 2–3.10.2026: surowica, IU/L i równoważne mIU/mL, ograniczenia wieku, płci, stadium i populacji konkretnego oznaczenia. Model kliniczny pozostaje pediatryczny 0–18 lat, z dotychczasowymi ograniczeniami leczenia, stymulacji i niemowlęctwa. Źródła rozdzielenia oceny stężenia i rozwoju pozostają K1–K4; pełne cytowania i rzeczywisty zakres wcześniejszego odczytu są w [wykazie źródeł](#źródła-i-rzeczywisty-zakres-odczytu). Nie dodano nowych źródeł ani norm.

Syntetyczne przypadki regresyjne dla rzeczywistego formularza, silnika i odczytu zapisów:

| Wejście lub działanie | Oczekiwane zachowanie |
|---|---|
| M, 2 lata 9 miesięcy, G3, LH2 IU/L, zgodna metoda, leczenie nieznane | Bez `reportedRange`; nadal warunkowo `above` dla wieku (`≤0,5`), `within` dla G3 (`0,09–4,2`) i `early_development`. |
| Ten sam kontekst, inna/nieznana metoda | Brak katalogowego porównania i podglądu oraz brak zastępczego ręcznego zakresu; konwersja i ostrzeżenie o zbyt wczesnym rozwoju pozostają. |
| Zmiana LH↔FSH, pacjenta lub ponowne otwarcie szczegółów | Dwie sekcje szczegółów; usunięte pole nie wraca i nie wpływa na nowe wejście z ukrycia. |
| Starszy klient przekazuje LH15 IU/L i `reportedRange` `0–20` przy katalogowym odchyleniu | Dotychczasowe odrębne porównanie i komunikat rozbieżności nadal obsługiwane przez publiczny adapter i silnik. |
| Odczyt wcześniej utrwalonego snapshotu z ręcznym zakresem | Ten sam zakres, status i ewentualny konflikt w historii/przypięciu; bez przeliczenia według aktualnego formularza. |

Testy sprawdzają zachowanie implementacji, nie stanowią walidacji klinicznej. Wpływ polega na zawężeniu danych nowej oceny, bez zmiany automatycznych norm i ich ograniczeń.

## Bieżący kontekst bez dodatkowego wywiadu i datowania próbki — 7.10.2026

Opis formularza `1.7.0`. Ograniczenie do bieżącego kontekstu pozostaje aktualne; wspomniany niżej zakres z wydruku usunięto z późniejszego UI zgodnie z sekcją powyżej.

**Decyzja właściciela:** szybki przelicznik ma oceniać wynik wyłącznie względem kontekstu widocznego w formularzu. Formularz `1.7.0` usuwa całą zakładkę „Dodatkowe informacje”, pytania o objawy OUN i regresję wcześniejszych cech, dokładną objętość jąder oraz metodę jej oceny. Usuwa również całą zakładkę „Wcześniejsze badanie”, datę pobrania i powrót do bieżących danych. Nie ma zastępczego odsyłacza „Wynik z innej daty”. Pytanie o wcześniactwo pozostaje w sekcji „Pacjent”, tylko przy znanym wieku obejmującym okres przed pierwszymi urodzinami.

**Zakres nowej oceny:** formularz zawsze tworzy `contextBasis='current-patient'`, a `birthDateISO` i `sampleDateISO` pozostają `null`. Wiek i płeć pochodzą z aktualnego formularza; korekta w przeliczniku dotyczy tego sprawdzenia. Pozostają stadium z prawidłowym dla płci rodzajem cechy, zgodna metoda oznaczenia, opcjonalny zakres z wydruku oraz odczyt właściwego bieżącego źródła: GnRHa, początku rozwoju, progresji i przyspieszenia wzrastania, o ile są znane. Ogólny numer Tannera nie staje się automatycznie G lub Th. Przelicznik nie wylicza wieku w dniu dawnego pobrania i nie rekonstruuje ówczesnego stadium ani leczenia.

Usunięte odpowiedzi nie przechodzą do silnika z ukrycia: `history.cnsSymptoms` i `history.regression` pozostają `unknown`, objętość jąder pozostaje `null`, a metoda pusta. Nie pobieramy tych danych automatycznie z karty ani ze starego stanu kontrolek. Brak pytania nie jest odpowiedzią „Nie”, a przedział objętości z formularza głównego nie staje się dokładnym pomiarem w mL. Zmiana pacjenta, płci, analitu lub odświeżenie źródła nie przywraca usuniętych informacji.

**Wpływ kliniczny:** podstawowe porównania LH/FSH według bieżącego wieku i stadium oraz ostrzeżenia o zbyt wczesnych cechach/początku pozostają dostępne na dotychczasowych zasadach. Z nowego formularza nie powstaną natomiast dodatkowe ostrzeżenia wywoływane zgłoszeniem objawów OUN lub regresji, ani ocena początku/sprzeczności i opis niemowlęcy oparty na dokładnej objętości jąder. Objawy te nadal mają znaczenie kliniczne; usunięcie ich z szybkiego formularza nie oznacza, że zostały wykluczone. Ocena nie obejmuje pełnego wywiadu i badania pacjenta. Samo G/Th pozostaje wejściem do oceny rozwoju, a dotychczasowe ograniczenie nieznanego leczenia nadal może prowadzić do `treatment_context` zamiast pewnego wniosku o czasie rozwoju.

Usunięcie datowania może zmienić wynik względem wcześniejszego trybu próbki, jeżeli aktualny wiek różni się od wieku pobrania. Przykład istniejącego profilu LH Mayo: **M14, LH2 IU/L** daje warunkowo `within` dla wieku (`0,8–8,7 IU/L`), podczas gdy ocena tego samego stężenia w wieku **8 lat** daje `above` (`≤0,5 IU/L`). Nowy formularz użyje widocznego wieku 14 lat; nie rozpozna sam, że wpisano wynik sprzed sześciu lat. Data wizyty lub przypięcia nie zmienia tego w ocenę historycznej próbki. Jest to zaakceptowane ograniczenie zakresu przelicznika, nie uznanie dzisiejszych danych za dane z dnia pobrania.

Stała informacja o oznaczeniach bazalnych bez leczenia pozostaje widoczna. Protokół i niepotwierdzone leczenie nadal mają wartość `unknown`; dostępne jest warunkowe `referencePreview`, bez automatycznego potwierdzenia zastosowania RI. Znane bieżące GnRHa „w trakcie” nadal blokuje zakresy bazalne. Wcześniactwo zachowuje dotychczasową bramkę populacji niemowlęcej; nie wprowadzamy nowych norm ani automatycznie skorygowanego wieku.

**Zgodność zapisów:** zmiana dotyczy zbierania danych przez nowy formularz. Publiczny `buildInput`, silnik `1.3.0`, dane i kryteria `2026-10-04.1`, snapshot `1.2.0` oraz renderer pozostają niezmienione. Nadal obsługują jawne dane starszych klientów, w tym daty, objawy OUN, regresję, dokładną objętość i metodę. Wizyty, przypięcia i historia pokazują zapisane oceny z ich pierwotnymi ostrzeżeniami, datami i kontekstem, bez migracji, filtrowania ani ponownego przeliczania. Dawny zapis oceny i rozpoczęcie nowego sprawdzenia to różne operacje.

**Źródła, populacja i jednostki:** nie zmieniamy żadnego RI, progu ani przeliczenia. Obowiązują istniejące profile surowicy LH Mayo LHPED 62999 (AnshLite CLIA) i FSH 602753 (Roche Elecsys ECLIA), odczytane 2–3.10.2026, z ograniczeniami wieku, płci, stadium i populacji konkretnej tabeli [R1,R2]. Jednostki to IU/L i równoważne mIU/mL. Model kliniczny pozostaje pediatryczny 0–18 lat. Znaczenie objawów OUN: Latronico i wsp., Endocrine Society 2026, DOI 10.1210/clinem/dgag168 [K1]; wywiadu, regresji i oceny początku: Persani i wsp., ENDO-ERN 2021, DOI 10.1007/s12020-021-02626-z [K2] i Howard 2021, DOI 10.1111/cen.14578 [K3]; odrębny kontekst niemowlęcy: Rohayem i wsp. 2024, DOI 10.1210/endrev/bnae003 [M1]. Wcześniactwo oznacza urodzenie przed 37 ukończonymi tygodniami według WHO, *Preterm birth*, 10.05.2023 [K6]. Pełne cytowania i zakres wcześniejszego odczytu są w [wykazie źródeł](#źródła-i-rzeczywisty-zakres-odczytu). Źródła uzasadniają ograniczenia interpretacji; decyzja o redukcji pól jest decyzją funkcjonalną właściciela, nie nowym zaleceniem medycznym.

Syntetyczne przypadki regresyjne wywołują rzeczywisty formularz, adapter, silnik i odczyt zapisu:

| Wejście lub działanie | Oczekiwane zachowanie |
|---|---|
| M, 2 lata 9 miesięcy, G3, LH2 IU/L, zgodna metoda, leczenie nieznane | `current-patient`, brak dat; warunkowo `above` dla wieku (`≤0,5`) i `within` dla G3 (`0,09–4,2`), nadal `early_development`. |
| Dane źródła zawierają objawy OUN, regresję i dokładną objętość jąder | Nowe wejście formularza nie przejmuje usuniętych informacji; OUN/regresja `unknown`, objętość `null`, metoda pusta. |
| Bieżący M14, LH2 IU/L, zgodna metoda; w źródle dawna data pobrania | Ocena według widocznych 14 lat (`within` dla wieku `0,8–8,7`), bez rekonstrukcji ośmiolatka i bez daty próbki. |
| Bieżące GnRHa „w trakcie” | Nadal brak bazalnego porównania i podglądu; usunięcie trybu historycznego nie pomija znanego leczenia. |
| Niemowlę z podanym wcześniactwem / zmiana wieku na 1 rok lub więcej | Pytanie dostępne w „Pacjent” dla niemowlęcia i dotychczasowe ograniczenie populacji; u starszego dziecka nie jest pokazywane jako dodatkowe pole. |
| Zmiana M↔F, pacjenta lub LH↔FSH | Zachowane reguły doboru rodzaju stadium i źródła; usunięte pola/datowanie nie odżywają. |
| Starszy klient jawnie przekazuje daty, OUN, regresję lub objętość | Dotychczasowa obsługa przez publiczny adapter i silnik pozostaje. |
| Odczyt zapisanej wcześniej datowanej oceny z dodatkowymi ostrzeżeniami | Te same utrwalone dane i ostrzeżenia; brak nowej oceny według dzisiejszego formularza. |

Ograniczenie zakresu i jego skutki zostały wyraźnie zaakceptowane przez właściciela. Testy potwierdzają zachowanie implementacji, nie nadają jej statusu walidacji klinicznej.

## Zakres bazalny bez selektora kontekstu — 7.10.2026

Opis poprzedniej wersji formularza `1.6.0`. Obsługa datowania wymieniona w tej sekcji dotyczy tej wersji; jej usunięcie z bieżącego formularza opisano powyżej.

Formularz `1.6.0` usuwa podsumowanie rodzaju oznaczenia, przycisk jego zmiany, zakładkę „Kontekst oznaczenia” i selektor protokołu/leczenia. Zastępuje je stała informacja: porównania dotyczą **oznaczeń bazalnych bez leczenia hormonalnego**. Moduł nie interpretuje odpowiedzi LH/FSH w testach stymulacyjnych GnRH/LHRH ani stężeń podczas leczenia hormonalnego. Nie dobiera norm dla leku, dawki, odstępu od podania lub protokołu stymulacji i nie ocenia skuteczności GnRHa.

**Informacja o zakresie modułu nie jest potwierdzeniem danych pacjenta.** Nowe wejście z formularza nadal ma `measurementKind='unknown'`, a bez dodatniej informacji z właściwej karty również `treatment.context='unknown'`. Nie wpisuje automatycznie oznaczenia bazalnego ani braku leczenia. Dostępne pozostaje istniejące `referencePreview` — warunkowe porównanie liczbowe z tabelą bazalną dla osoby bez leczenia, z warunkami widocznymi przy wyniku. Wymaga właściwej metody, wieku, płci i spełnienia pozostałych ograniczeń; typowane stadium dodaje oddzielne porównanie. `biochemical.primary` pozostaje `null`, jeżeli zastosowanie zakresu nie zostało potwierdzone.

**Znane leczenie z formularza głównego:** dla gotowego, aktualnego kontekstu `current-patient` status GnRHa „w trakcie” pozostaje dodatnią informacją i wyłącza porównanie z zakresami bazalnymi, również podgląd warunkowy. „Zakończone” i brak informacji pozostają `unknown`; nie ustalamy okresu wypłukiwania ani braku wpływu ostatniej dawki. Status „brak” ustala wyłącznie brak zgłoszonego GnRHa, a nie brak wszystkich leków hormonalnych. Po wpisaniu daty wcześniejszej próbki dzisiejsze leczenie nie przechodzi do `contextBasis='sample'`. Podczas odczytu `loading/unavailable` nie wykorzystujemy poprzedniego kontekstu leczenia.

**Wpływ kliniczny i ograniczenie zakresu:** z nowego formularza znika możliwość jawnego potwierdzenia „Bazalne, bez leczenia hormonalnego”, więc dotychczasowa droga od porównania warunkowego do potwierdzonego RI nie jest w nim dostępna. Nie ma też ręcznego zgłoszenia stymulacji lub innego leczenia. Jeżeli takich danych nie ma we właściwym źródle, aplikacja ich nie rozpozna; sama stała informacja nie jest automatyczną kwalifikacją próbki. Wyniku po stymulacji lub podczas leczenia nie należy oceniać za pomocą dostępnego podglądu bazalnego. To jawne ograniczenie uproszczonego formularza, nie rozszerzenie jego zdolności interpretacyjnych. Osobne komunikaty rozwoju i ograniczenia wynikające z wywiadu zachowują znaczenie; nie są oceną skuteczności leczenia ani odpowiedzi stymulowanej. Opcjonalny zakres z wydruku nadal daje wyłącznie porównanie liczbowe, bez potwierdzenia zastosowania klinicznego.

Brak potwierdzenia leczenia wpływa także na dostępność niektórych komunikatów rozwoju w nowym formularzu: G1 od 14 lat lub Th1 od 13 lat, bez odpowiedniego wcześniejszego początku i przy nieznanym leczeniu, pozostaje ograniczoną oceną „Brak cech wymaga uwzględnienia wywiadu” (`treatment_context`), zamiast przejść przez dawny jawny wybór do `absent_onset`. Przy pozostałych danych pozwalających na ocenę czasu, ale bez potwierdzonego braku leczenia, nie powstaje również `no_timing_alert`; pozostaje ograniczenie leczenia. Nie jest to nowy algorytm ani automatyczne rozpoznanie opóźnienia. Dotychczasowa ścieżka minimalnych danych działa tak samo; znika droga ręcznego potwierdzenia, która umożliwiała te dalsze wnioski. Ostrzeżenia o zbyt wczesnych cechach lub początku w wywiadzie nadal mogą być widoczne.

Silnik `1.3.0`, dane `2026-10-04.1`, kryteria i jednostki pozostają bez zmian. Publiczny adapter `buildInput`, silnik i kontrakt zapisu nadal przyjmują jawne konteksty starszych klientów; znane leczenie lub stymulacja nadal blokują nieadekwatny profil. Zapisane oceny w wizytach, przypięciach i historii zachowują własne dane, warunkowość i tekst. Nie są migrowane, ponownie przeliczane ani zamieniane na kontekst nieznany.

**Źródła i populacja:** stosujemy istniejące katalogi Mayo R1 (LH pediatryczne LHPED 62999, AnshLite CLIA) i R2 (FSH 602753, Roche Elecsys ECLIA), odczytane 2–3.10.2026, dla surowicy, IU/L i równoważnych mIU/mL, w granicach wieku, płci i stadium każdego profilu. Model kliniczny pozostaje pediatryczny 0–18 lat, z odrębnymi ograniczeniami niemowlęcymi i wcześniactwa. Rozdzielenie oznaczenia bazalnego, stymulacji i leczenia opiera się na dotychczasowych K1 (Latronico i wsp., Endocrine Society 2026, DOI 10.1210/clinem/dgag168), K3 (Howard 2021, DOI 10.1111/cen.14578) i K4 (Bangalore Krishna i Garibaldi 2025, DOI 10.3389/fped.2024.1504874). Pełne cytowania i rzeczywisty zakres wcześniejszego odczytu są w [wykazie źródeł](#źródła-i-rzeczywisty-zakres-odczytu). Usunięcie kontrolki nie ustanawia nowych zakresów referencyjnych ani progów diagnostycznych.

Syntetyczne przypadki regresyjne dotyczą rzeczywistego formularza, adaptera, silnika i odczytu zapisu:

| Wejście lub działanie | Oczekiwane zachowanie |
|---|---|
| M, 2 lata 9 miesięcy, G3, LH2 IU/L, zgodna metoda, brak danych leczenia | Bez selektora kontekstu; wejście z nieznanym protokołem/leczeniem, warunkowo `above` dla wieku (`≤0,5`) i `within` dla G3 (`0,09–4,2`), nadal `early_development`. |
| Właściwa bieżąca karta ze statusem GnRHa „w trakcie” | Dodatni kontekst leczenia; brak bazalnego RI i `referencePreview`, bez przypisania innego zakresu. |
| GnRHa „zakończone” albo brak danych | Nie staje się potwierdzonym brakiem leczenia; dostępność podglądu nadal zależy od wszystkich pozostałych ograniczeń. |
| GnRHa „brak” | Brak zgłoszonego GnRHa nie potwierdza braku steroidów płciowych ani całego leczenia hormonalnego. |
| Dzisiejsza karta z GnRHa „w trakcie” → wpisanie wcześniejszej daty pobrania | Brak przeniesienia dzisiejszej terapii; kontekst leczenia próbki pozostaje nieznany. |
| M14/G1 lub F13/Th1, nieznane leczenie, brak odpowiedniego wcześniejszego początku | `limited` / `treatment_context`, bez automatycznego `absent_onset`. |
| M16/G3 z początkiem G w wieku 12 lat, nieznane leczenie | Ograniczona ocena zależna od leczenia; brak `no_timing_alert` przez domniemanie braku terapii. |
| Starszy klient jawnie przekazuje `stimulated` lub leczenie hormonalne | Produkcyjny silnik nadal blokuje bazalne porównanie i podgląd; UI nie dodaje profilu po stymulacji lub podczas leczenia. |
| Odczyt wcześniejszej oceny z potwierdzonym bazalnym kontekstem lub ograniczeniem leczenia/stymulacji | Zachowana oryginalna ocena i jej kontekst, bez przeliczenia lub dopisywania dzisiejszych założeń. |

Akceptacja kliniczna pozostaje wymagana, ponieważ zmienia się sposób ustalania kontekstu nowej oceny. Syntetyczne regresje i zielone testy nie stanowią walidacji klinicznej.

## Dobór pól dojrzewania do płci — 4.10.2026

Opis formularza `1.5.0`: dobór rodzaju stadium do płci pozostaje aktualny, natomiast pola objętości i metody oraz tryb datowania zostały później usunięte z bieżącego UI w `1.7.0`.

Szybki formularz LH/FSH udostępnia wyłącznie rodzaje obserwacji obsługiwane dla wybranej płci przez istniejący model referencyjny. Nie dodaje nowych pól ani nowego etapu wprowadzania danych.

| Płeć w bieżącym sprawdzeniu | Dostępne rodzaje cechy | Objętość jąder i metoda jej pomiaru |
|---|---|---|
| M | Nie określono, G — rozwój narządów płciowych, P — owłosienie łonowe, Ax — owłosienie pachowe | Dostępne opcjonalnie; dokładna objętość w mL. |
| F | Nie określono, Th/M — rozwój piersi, P, Ax | Ukryte, wyłączone i puste. |
| Nie podano | Nie określono, P, Ax | Ukryte, wyłączone i puste; Th/G wymaga podania płci. |

Zmiana płci usuwa niezgodny rodzaj cechy razem z przypisanym stadium. **Th3 nie staje się G3, a G3 nie staje się Th3.** Zgodne P/Ax pozostają odrębnymi obserwacjami; Ax nadal nie ma liczbowego stadium. Jawne usunięcie płci również nie zachowuje wcześniej typowanego Th/G. Objętość i metoda pomiaru są usuwane przy odejściu od M i nie wracają przez samo ponowne wybranie M. Te same ograniczenia obowiązują przy tworzeniu nowego wejścia dla silnika, więc samo ukrycie kontrolki nie pozostawia wartości aktywnej w ocenie.

Płeć z formularza głównego steruje listą wyboru po automatycznym odczycie. Ręczna korekta w LH/FSH nadal dotyczy wyłącznie tego sprawdzenia. Ogólny numer Tannera importowany z formularza zachowuje typ „Nie określono”; płeć nie potwierdza, czy oceniono G, Th czy P. Wybór rodzaju jest nadal świadomym doprecyzowaniem obserwacji. Pomiar objętości oraz informacja o początku rozwoju z karty nie są przepisywane pod inny rodzaj gonadalny po zmianie płci.

Przejściowy odczyt `loading/unavailable` wyłącza obserwacje wymagające nieodczytanej jeszcze płci z formularza i oceny. Ręczne dane tej samej osoby mogą wrócić po gotowym odczycie tej samej płci, jeśli w międzyczasie nie zmieniono właściwych pól; nie wracają po zmianie płci, osoby ani przejściu na inną podstawę datowania.

Odczyt gotowego, zgodnego rekordu udostępnia `sourceSex` (M/F lub `null`). Adapter ustala typ początku z tego zapisu według jego płci źródłowej, a nie aktualnej płci formularza. Przy braku płci źródłowej nie tworzy typowanego początku. Jeżeli typ początku nie odpowiada płci bieżącego sprawdzenia, formularz pomija całą tę obserwację (rodzaj, wiek/datę i potwierdzenie), z widoczną informacją o pominięciu. Nie przemianowuje G na Th ani odwrotnie. Bez wybranego rekordu sejfu dane początku z bieżącego formularza pozostają związane z jego bieżącą płcią. Nie zmienia to zapisu karty ani danych formularza głównego.

**Podstawa kliniczna i ograniczenia:** istniejące źródła K2 (Persani i wsp., ENDO-ERN 2021, DOI 10.1007/s12020-021-02626-z) i K3 (Howard 2021, DOI 10.1111/cen.14578) rozdzielają rozwój piersi u dziewcząt oraz rozwój genitaliów i objętość jąder u chłopców. K5 (Rosenfield 2021, DOI 10.1210/endrev/bnab009) wyjaśnia odrębność adrenarche od gonadarche; dlatego P/Ax pozostają dostępne dla obu płci, lecz nie zastępują Th/G. Pełne dane bibliograficzne i zakres wcześniejszego odczytu są w [wykazie źródeł](#źródła-i-rzeczywisty-zakres-odczytu). Reguła dotyczy istniejącej populacji pediatrycznej 0–18 lat i kategorii M/F tego modelu. Nie jest twierdzeniem o niemożliwości wystąpienia innych objawów klinicznych ani algorytmem oceny ginekomastii lub różnic rozwoju płciowego. Nie wyprowadza anatomii, płci ani stadium z wartości hormonów. Kategorie objętości nie są zamieniane na mL, a sam pomiar jąder nie wyznacza pełnego stadium G.

**Wpływ kliniczny:** zmienia się dobór wejścia nowej oceny; sprzeczne lub nieadekwatne pola nie mogą wpływać na nią z ukrycia. Usunięcie niezgodnej obserwacji może zmienić dostępność porównania stadium lub komunikat rozwoju i wymaga ponownego podania właściwej obserwacji. Nie oznacza prawidłowości rozwoju. Silnik `1.3.0`, zakresy i kryteria danych `2026-10-04.1`, jednostki LH/FSH IU/L i mIU/mL oraz ograniczenia metod pozostają bez zmian. Zapisane oceny wizyt, przypięć i historii zachowują własny kontekst i tekst; nie są filtrowane nowym formularzem, przeliczane ani migrowane.

Syntetyczne przypadki akceptacyjne wywołują produkcyjny adapter/formularz i silnik; nie stanowią deklaracji walidacji klinicznej:

| Wejście lub działanie | Oczekiwane zachowanie |
|---|---|
| M, 2 lata 9 miesięcy, G3, LH2 IU/L, zgodna metoda | G jest dostępne, Th nie; istniejące osobne porównania wieku/stadium i ostrzeżenie wczesnego rozwoju pozostają. |
| F, Th3 → zmiana na M | Th znika z listy, rodzaj i stadium są wyczyszczone; brak automatycznego G3 i porównania dla dawnego Th3. |
| M, G3, objętość 8 mL metodą Pradera → F → M | Niezgodne G3 oraz objętość/metoda są usunięte i nie odżywają po ponownym wyborze M. |
| M, P3 → F; dowolna płeć, Ax | P3 pozostaje P3; Ax nie otrzymuje stadium. Żaden przypadek nie staje się gonadalnym Th/G. |
| Płeć niepodana, ogólny Tanner III → M lub F | Numer może pozostać nieokreślonym Tannerem; wybór płci sam nie nadaje G3/Th3. |
| Ręczne G3 i pomiar objętości, odświeżenie źródła tej samej osoby | Podczas odczytu brak tych danych w ocenie; powrót M bez edycji przywraca właściwy kontekst, powrót F go usuwa. Spóźniony odczyt innej osoby nie przywraca obserwacji. |
| Zapis M z początkiem w wieku 6,5 roku, aktualny formularz F | Adapter zachowuje źródłowy typ G i konserwatywny wiek 6 ukończonych lat; formularz LH/FSH pomija niezgodny początek i informuje o tym, bez utworzenia początku Th. |
| Zapis z wiekiem początku bez zapisanej płci, aktualny formularz M lub F | Brak domniemanego początku G/Th; dzisiejsza płeć nie uzupełnia brakującego źródła. |
| Zapisana wcześniej ocena po zmianie płci w nowym sprawdzeniu | Odczyt tej samej zapisanej oceny i granic, bez ponownej interpretacji lub backfill. |

Formularz ma wersję `1.5.0`. Regresje wywołują produkcyjny adapter i silnik (`tests/unit/lab-puberty-sex-aware.test.mjs`), źródło i odczyt kontekstu (`tests/unit/lab-puberty-source-provenance.test.mjs`) oraz rzeczywisty formularz (`tests/e2e/lab-puberty-sex-aware.spec.mjs`). Akceptacja kliniczna i scalenie pozostają decyzją właściciela.

## Prezentacja zakresów i znacznych odchyleń — 4.10.2026

Zaakceptowany widok zachowuje układ formularza, dużą wartość i konwersje. Porównania wieku i stadium otrzymują osobne osie z pasmem zakresu i znacznikiem wyniku, na wspólnej skali liniowej. Granice pochodzą wyłącznie z zakresów utrwalonych w ocenie; wspólna skala nie tworzy wspólnej normy. Nieznana dolna granica pozostaje nieznana: początek osi w zerze nie stanowi nowej dolnej granicy RI, a cenzorowany dolny brzeg, np. `<0,02`, nie jest dokładnym progiem. Pełny zapis granic i operatorów pozostaje dostępny przy porównaniu.

Warstwa prezentacji stosuje przyjętą wcześniej dla innych hormonów **konwencję wyróżnienia znacznego odchylenia**: wynik dokładny **większy niż dwukrotność górnej granicy** otrzymuje czerwone wyróżnienie, drżenie znacznika, wykrzyknik i etykietę „Uwaga — znacznie powyżej normy”. Wynik dokładny **mniejszy niż połowa znanej, dodatniej dolnej granicy** otrzymuje analogiczne wyróżnienie bursztynowe „Uwaga — znacznie poniżej normy”. Równość z tymi progami nie uruchamia silnego wyróżnienia. Reguła działa oddzielnie dla wieku i stadium oraz wyłącznie przy odpowiednio zapisanym statusie `above` lub `below`. Duża wartość wskazuje zakres będący podstawą wyróżnienia; sprzeczne kierunki nie są łączone w jedną ocenę prawidłowości.

**To konwencja interfejsu, a nie nowy próg diagnostyczny, kryterium CPP, miara pilności lub zalecenie leczenia.** Źródłem tej konwencji jest istniejące `classifyResultState` w przeliczniku i zaakceptowana makieta, nie katalogi Mayo ani wytyczne. Dane referencyjne `2026-10-04.1`, dobór zakresów, silnik kliniczny, jednostki i statusy biochemiczne pozostają bez zmian. Zakresy nadal dotyczą konkretnych metod, populacji i protokołów R1/R2: surowicy, LH AnshLite CLIA lub FSH Roche Elecsys ECLIA, stężeń w IU/L i równoważnych mIU/mL. Ograniczenia kliniczne K1–K4 zachowują znaczenie.

Warunkowe zestawienie nadal pokazuje warunki zastosowania poza zwijanymi szczegółami; silne wyróżnienie również jest oznaczone jako warunkowe. Nieznana/niezgodna metoda, znane leczenie, stymulacja i pozostałe blokady nie są obchodzone przez wykres. Wyniki `<x`, `≤x`, `>x`, `≥x`, `<LOD` i `<LOQ` zachowują operator: mogą mieć zapisane porównanie przedziałowe, ale nie otrzymują wymyślonego dokładnego punktu ani animowanego wyróżnienia. Zakres przepisany z wydruku pozostaje oddzielnym porównaniem; nie zastępuje zakresów wieku/stadium ani nie wycisza ich rozbieżności.

Ocena rozwoju pozostaje widoczna niezależnie od koloru osi. Tekst zapisanej oceny, w tym dodatkowe akapity dotyczące OUN, regresji i objętości jąder niemowlęcia, zachowuje swoje znaczenie. Metadane, ograniczenia i źródła są zebrane w rozwijanych szczegółach. Kolor pasma „w zakresie” nie oznacza prawidłowości całego obrazu klinicznego. Systemowa preferencja ograniczenia ruchu wyłącza animacje, zachowując kolor, wykrzyknik i tekst; ręczny przełącznik usunięto w rendererze `1.7.0`. Historyczny odczyt korzysta z zapisanej liczby, granic, warunków, źródeł i akapitów; nie wywołuje silnika ani nie uzupełnia dawnych zapisów dzisiejszym kontekstem. Unieważniona ocena pozostaje jawnie historyczna.

Syntetyczne regresje wywołują produkcyjne funkcje oceny i renderera oraz rzeczywisty formularz:

| Wejście | Oczekiwany widok |
|---|---|
| M, 2 lata 9 miesięcy, G3, LH2 IU/L, zgodna metoda, nieustalone leczenie/protokół | Warunkowe czerwone wyróżnienie dla wieku (`≤0,5`), spokojny znacznik w zakresie G3 (`0,09–4,2`), wspólna skala, zachowane ostrzeżenie o zbyt wczesnych cechach. |
| To samo, LH1 / LH1,001 IU/L | Dokładnie 2× górna granica wieku: zwykłe odchylenie; dopiero LH1,001: silne czerwone wyróżnienie. |
| M16/G3, LH0,02 IU/L, zgodna metoda, bazalne bez leczenia | Silne bursztynowe wyróżnienie względem znanych dodatnich dolnych granic; nie nowe rozpoznanie opóźnienia. |
| Wynik równy 0,5× dolna granica / mniejszy od tej wartości | Odpowiednio zwykłe / silne dolne odchylenie; brak takiej reguły dla granicy zerowej, nieznanej lub cenzorowanej. |
| LH `<LOD` lub `<0,02`, także przy zachowanym ostrzeżeniu klinicznym | Surowy zapis i operator; bez dokładnego punktu i bez silnego efektu. |
| Znane leczenie, stymulacja lub brak zgodnej metody | Brak nieuprawnionej osi odniesienia i silnego efektu; niezależny komunikat kliniczny pozostaje. |
| Zapisana ocena po zmianie bieżącego pacjenta | Te same zapisane granice, warunki i treść; brak ponownego wyliczenia lub backfill. |

Formularz i renderer mają wersję `1.4.0`; silnik pozostaje `1.3.0`, a snapshot `1.2.0`. Regresje warstwy prezentacji znajdują się w `tests/unit/lab-assessment-axes.test.mjs`, `tests/unit/lab-assessment-ui.test.mjs`, `tests/unit/lab-minimal-context-snapshot-ui.test.mjs` i `tests/e2e/lab-puberty-result-presentation.spec.mjs`; korzystają z rzeczywistego silnika, renderera i formularza. Zmienia się hierarchia i siła wizualna informacji; nie zmieniają się obliczenia ani utrwalone interpretacje. Przegląd kliniczny właściciela pozostaje wymagany przed scaleniem, ponieważ wyróżnienie wyniku może wpływać na odczyt kliniczny.

## Minimalne dane i porównanie warunkowe — 4.10.2026

Opis wersji z 4.10.2026: silnik, formularz i renderer `1.3.0`, helper snapshotu `1.2.0`. W poprzednim szybkim formularzu nieustalony kontekst oznaczenia blokował oba porównania, mimo że pole opisano jako opcjonalne. Od tej wersji wynik, jednostka, płeć, wiarygodny wiek oraz zgodna metoda wystarczają do **warunkowego porównania liczbowego** z dostępnym zakresem wieku. Typowane stadium dodaje osobne porównanie stadium; nie jest wymagane dla zakresu wieku.

Nie ustalamy domyślnie bazalnego protokołu ani braku leczenia. Przy ich nieznanym statusie wejście nadal zawiera `unknown`. Osobne, opcjonalne `evaluation.referencePreview` zawiera `kind='conditional-basal-untreated'`, przyczyny niepewności oraz `byAge`/`byStage` z pełnym pochodzeniem tabeli. Dotychczasowe `biochemical` zachowuje znaczenie porównania o potwierdzonym zastosowaniu; podgląd nie staje się jego `primary`. Wynik pokazuje warunki zastosowania przy liczbach, poza zwijanymi ograniczeniami. Etykieta „Liczbowo w zakresie” nie jest potwierdzeniem prawidłowości wyniku ani rozwoju.

Jawna stymulacja, leczenie hormonalne/GnRHa/steroidami, nieznana lub niezgodna metoda, nieaktywny/stary profil, niewłaściwy materiał, błędny wiek/płeć i ograniczenia niemowlęce nadal blokują niedopasowane porównanie. Nie zmieniają się tabele `2026-10-04.1`, profile, progi, jednostki ani zasady cenzorowania. W formularzu tej wersji wybór „Bazalne, bez leczenia hormonalnego” usuwał warunkowość; od wersji `1.6.0` ten selektor jest usunięty zgodnie z opisem powyżej. Dodatnie informacje z karty nie są pomijane przez podgląd.

Populacje i metody pozostają przypisane do konkretnych katalogów Mayo: LH pediatryczne AnshLite CLIA oraz FSH Roche Elecsys ECLIA, surowica, IU/L i równoważne mIU/mL. Zakresy i ich ograniczenia są opisane niżej [R1,R2]; kryteria rozwoju i rozróżnienie oznaczenia bazalnego, stymulacji oraz leczenia pozostają zgodne z K1,K3,K4. **Jest to zmiana sposobu udostępniania porównania, wymagająca oceny klinicznej właściciela, a nie nowe kryterium diagnostyczne ani dowód zastosowania normy do nieustalonego protokołu.**

Syntetyczny przypadek produkcyjnego kodu: M, 2 lata 9 miesięcy, G3, LH2 IU/L, zgodna konfiguracja AnshLite, nieustalony protokół i leczenie → warunkowo powyżej zakresu wieku (`<0,02–0,5`) i w zakresie G3 (`0,09–4,2`), nadal nadrzędne `early_development`. Bez stadium dostępny pozostaje zakres wieku. Znane leczenie lub stymulacja nie otrzymują tego podglądu. `<LOD` nie staje się punktem ani pewnym porównaniem.

Schemat snapshotu pozostaje `1`: rozszerzenie jest opcjonalne, a historia odtwarza zapisaną warunkowość bez bieżących danych i ponownego liczenia. Starsze zapisy nie są uzupełniane nowym podglądem. Starszy odczyt pomijający nieznane rozszerzenie nadal widzi niedostępne porównanie bazalne, więc nie zamienia podglądu w bezwarunkowe „w normie”. Regresje: `lab-puberty-minimal-context`, `lab-minimal-context-snapshot-ui` oraz `lab-puberty-minimal-context.spec.mjs`.

## Szybkie sprawdzenie — 4.10.2026

Opis historycznej wersji: silnik `1.2.0`, formularz `1.2.0`, renderer `1.2.0` i helper snapshotu `1.1.0` upraszczały obsługę po akceptacji makiety przez właściciela. Dane `2026-10-04.1`, cztery profile RI i kryteria liczbowe pozostały bez zmian. To zamierzona zmiana doboru kontekstu i sposobu porównania, nie nowa walidacja metod oznaczeń [R1,R2,K1–K4]. Poniższy wybór kontekstu dotyczy tej historycznej wersji; usunięcie go w `1.6.0` opisano na początku dokumentu.

**Profil oznaczenia.** Jeden wybór pełnej metody z materiałem zastępuje oddzielne pola materiału, profilu, metody i checkbox potwierdzenia. Użytkownik zapisuje ustawienie osobno dla LH i FSH na danym urządzeniu. Preferencja zawiera wyłącznie identyfikator i wersję profilu, metodę oraz materiał; nie przechowuje pacjenta, wieku ani odpowiedzi o leczeniu. Nie ma domyślnie aktywnej metody. Przy odczycie wymagana jest dokładna zgodność z aktywnym profilem danych. Zmiana wersji, metody lub materiału wymaga ponownego wyboru. `assay.confirmation='configured'` oznacza zapisaną konfigurację, a nie sprawdzenie konkretnego wyniku (`reported`). Wynik i historia jawnie pokazują to pochodzenie. „Inna/nieznana metoda dla tego wyniku” wyłącza ustawienie dla pojedynczego oznaczenia bez kasowania preferencji.

**Kontekst oznaczenia.** Jeden wybór zastępuje rozbudowane pytania o protokół i leczenie: nieokreślony; bazalne bez leczenia hormonalnego; podczas leczenia hormonalnego; po stymulacji. Brak odpowiedzi nie ustawia bazalnego oznaczenia ani braku GnRHa/steroidów. Ogólny dodatni kontekst leczenia nie zgaduje konkretnego leku. Aktywne GnRHa z właściwej karty pozostaje dodatnią informacją, zakończone — nieznanym kontekstem; sam brak GnRHa nie dowodzi braku steroidów płciowych. Odpowiedzi kliniczne nie są preferencją urządzenia i nie przechodzą na kolejnego pacjenta. Automatyczne RI wymaga zgodnej zapisanej metody oraz ustalonego kontekstu, tak samo jak odpowiednich wieku, płci i populacji [R1,R2,K1,K4].

**Dane formularza.** Domyślne `input.contextBasis='current-patient'` oznacza porównanie względem wieku i rozwoju podanych w głównym formularzu. Nie nadaje daty pobrania ani badania. Wiek zachowuje precyzję ukończonych lat/miesięcy; data urodzenia bez daty pobrania nie zastępuje tych części. Numer Tannera jest importowany jako nieokreślony typ; jeden wybór G/Th/P doprecyzowuje znaczenie. `appliesToCurrentContext` nie jest `appliesToSample`. Kategorie objętości jąder nie są konwertowane na liczbę mL lub metodę Pradera. Znany wiek początku z jednoznacznego pola karty jest przenoszony jako konserwatywny przedział ukończonych lat, także gdy zapisano ułamek roku; nie odtwarzamy daty ani trwałego początku w niemowlęctwie.

**Wcześniejsze badanie.** Data pobrania przełącza na `contextBasis='sample'`: wiek wynika z rzeczywistej DOB albo ręcznie podanego wieku wówczas. Dzisiejsze stadium i leczenie nie są przypisywane próbce. Jeżeli użytkownik uzupełni stadium w tej ścieżce, etykieta wskazuje wprost dzień pobrania; nie ma osobnego checkboxu ani pola źródła obserwacji. Zmiana pacjenta usuwa lokalny wynik i kontekst kliniczny; odczyt `loading/unavailable` nie wykorzystuje starych importów. Ręczne korekty tej samej osoby pozostają odrębne od automatycznego źródła.

**Zakres z wydruku — wcześniejszy interfejs i zachowany kontrakt.** Ówczesne opcjonalne pole przyjmowało przedział `0,5–3,0` lub granicę `<`, `≤`, `>`, `≥`; od 8.10.2026 nie ma go w bieżącym formularzu. Jednostka pochodzi z wyniku (IU/L lub równoważne mIU/mL). Obsługiwany dla zgodności `reportedRange` jest porównaniem liczbowym z zakresem przepisanym przez użytkownika — nie kompletnym `localReference`, zweryfikowaną populacją ani profilem Mayo. Wykorzystuje produkcyjne porównywanie przedziałów; wyniki cenzorowane zachowują operator i możliwą niejednoznaczność. Nieprawidłowy zakres nie daje oceny. Rozbieżność z dopasowanym katalogowym RI pozostaje widoczna i wymaga uzgodnienia; zgodność z ręcznym zakresem nie usuwa ostrzeżenia rozwoju.

**Zapis.** Nowe pola są opcjonalnym rozszerzeniem schematu oceny `1`. Snapshot utrwala faktycznie użyty profil, pochodzenie konfiguracji, podstawę wieku/obserwacji oraz wpisany zakres. Historyczny odczyt nie pobiera dzisiejszych preferencji i nie przelicza oceny. Starsze oceny zachowują treść i znaczenie; zmiana komentarza nie zmienia oceny, zmiana wyniku/daty nadal wymaga jawnego unieważnienia lub przeliczenia.

Syntetyczne regresje rzeczywistych funkcji: ustawienie LH nie aktywuje profilu FSH; zapis i ponowny odczyt metody daje `configured`; M6/G4/LH2 na wieku formularza zachowuje ostrzeżenie rozwoju, bez sfabrykowanej daty; sam numer Tannera nie otwiera RI stadium; data starszego badania usuwa dzisiejszy kontekst; brak danych o leczeniu nadal blokuje bazalny RI; zakres `0–20` nie wycisza konfliktu z dopasowanym RI dla LH15; `<LOD` nie staje się punktem liczbowym. Testy: `lab-profile-preferences`, `lab-puberty-quick`, `lab-quick-snapshot-ui` oraz cztery przeglądarkowe zestawy `lab-puberty-*`.

## Poprawki kontekstu klinicznego — 4.10.2026

Silnik `1.1.0`, dane i profil kliniczny `2026-10-04.1` rozszerzają komunikaty w dotychczasowym układzie LH/FSH. Cztery profile referencyjne, ich wersje, granice, metody, jednostki oraz polityka biochemiczna pozostają bez zmian. Zakres pediatryczny profilu klinicznego to 0–18 lat; szczególny komunikat objętości dotyczy chłopców przed pierwszymi urodzinami, z pomiarem w mL potwierdzonym dla próbki.

- **GnRHa (M01):** import statusu karty „zakończone” daje „Nie wiadomo”, a nie „Tak” ani „Nie”. Status bez dat leczenia i pobrania nie ustala ekspozycji ani wpływu ostatniej dawki. Użytkownik potwierdza kontekst dnia pobrania; nie wprowadzamy okresu wypłukiwania. Automatyczne odświeżenie źródła nie nadpisuje ręcznie podanej odpowiedzi; ponowne jawne użycie danych karty importuje aktualny status. „W trakcie” i „brak” zachowują dotychczasowe mapowanie, z obowiązkiem sprawdzenia zgodności z próbką. Nieznane leczenie nadal blokuje automatyczny bazalny RI [K1,K4].
- **Regresja (M02):** dodatni wywiad dodaje widoczny akapit o cofnięciu wcześniejszych cech, także przy prawidłowym czasie początku lub trwającym leczeniu. Nie utożsamiamy regresji z brakiem progresji, trwałym zatrzymaniem ani rozpoznaniem choroby [K2,K3].
- **OUN (M03):** dodatni wywiad ma osobny akapit i uwagę w podsumowaniu niezależnie od wyniku LH/FSH. Potwierdzone wczesne Th≥2 z objawami OUN dodaje informację o sprawnej ocenie specjalistycznej: zalecenie samej obserwacji izolowanej thelarche nie obejmuje tej sytuacji [K1, uwagi do 1.1–1.2]. Samo „Tak” nie określa przyczyny, indywidualnej pilności ani wskazania do MRI.
- **Objętość jąder niemowlęcia (M04, ograniczona poprawka):** każdy ważny, aktualny pomiar otrzymuje widoczny opis wartości, metody i braku zweryfikowanego zakresu objętości dla wieku/metody. Nie klasyfikujemy go jako prawidłowy lub nieprawidłowy. Próg 4 mL dla początku pokwitania nie staje się alarmowym progiem niemowlęcym; średnie z tabeli 2 przeglądu M1 nie są RI. Ustalenie i walidacja ewentualnego progu alarmowego pozostają otwarte.

Dodatni wywiad zmienia podsumowanie na `attention`, ale zachowuje kod, tytuł i status samej oceny czasu oraz osobne porównania laboratoryjne. Istniejące ostrzeżenie czasu ma pierwszeństwo w tytule podsumowania. Akapity i kody są utrwalane w dotychczasowym `schemaVersion:1`; wspólny renderer pokazuje zapisany tekst również w przypięciu i historii. Odczyt nie uruchamia silnika ani nie dopisuje nowych komunikatów do starszych ocen.

Syntetyczne przypadki produkcyjnej funkcji i przeglądarki: M16/G3, początek G w wieku 12 lat, LH2 IU/L, zgodna metoda → oba RI `within`; dodanie regresji lub OUN → osobny komunikat i `summary=attention`, bez zmiany oceny czasu. F7/Th2 + OUN → komunikat o ocenie specjalistycznej. M3 mies., objętość 1/8/15 mL → w każdym przypadku jawny brak kryterium objętości, bez wymyślonego progu. Import zakończonego GnRHa → `unknown`; ręczne ustalenie kontekstu jest zachowane przy automatycznym odświeżeniu źródła. Testy: `lab-puberty-clinical-context.test.mjs`, `lab-assessment-ui.test.mjs` i `lab-puberty-clinical-context.spec.mjs`.

Ponownie przejrzano pełne dostępne teksty K2/K3/M1 oraz oficjalne rekomendacje K1 z uwagami technicznymi; zakres dostępu opisano w wykazie źródeł. Jest to zmiana interpretacji klinicznej wymagająca oceny właściciela przed scaleniem. Nie zamyka pozostałych punktów audytu technicznego, w tym walidacji chronologii w podstawowym `assessTiming` (A08) i wejścia (A09).

## Etapy wdrożenia

PR1 dodaje czytelne dane `vilda_lab_puberty_data.js` (`VildaLabPubertyData`, wersja `2026-10-03.1`) i silnik `vilda_lab_puberty.js` (`VildaLabPuberty`, wersja `1.0.0`). **W PR1 moduły nie były ładowane przez istniejące strony ani service worker.** Nie zmieniają obecnego przelicznika, jego norm, komunikatów, przypiętych wyników ani danych pacjentów. Nie zastępują jeszcze `lab_units_data.js` i `lab_unit_converter.js`.

Silnik jest deterministyczny: nie czyta DOM, magazynów, zegara ani sieci i niczego nie zapisuje. Zestaw danych trzeba przekazać jawnie:

```js
const wynik = VildaLabPuberty.evaluate(wejscie, VildaLabPubertyData);
```

Publiczne funkcje: `evaluate`, `parseMeasurement`, `resolveAge`, `compareMeasurement`, `assessTiming`. W przeglądarce API jest globalne; w Node dostępne przez `module.exports`. Normy i kryteria kliniczne są danymi przekazanymi do silnika, a nie domyślnymi liczbami zaszytymi w kodzie.

Kwalifikację populacji laboratoryjnej określa odrębna `biochemicalPolicy` (`pediatric-basal-eligibility`, wersja `2026-10-03.1`), m.in. kontekst niemowlęcy i wcześniactwo. Nie zależy od obecności `clinicalProfile`: jego brak ogranicza ocenę kliniczną, ale nie omija ograniczeń zakresów referencyjnych u wcześniaków. Brak polityki biochemicznej w przekazanych danych blokuje automatyczny RI, zachowując konwersję jednostek.

Przykład syntetyczny wywołania, bez identyfikatora pacjenta:

```js
const wynik = VildaLabPuberty.evaluate({
  analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
  birthDateISO: '2020-10-03', sampleDateISO: '2026-10-03',
  specimen: 'serum', measurementKind: 'basal',
  assay: {
    profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia',
    confirmation: 'reported' // musi odpowiadać metodzie rzeczywistej próbki
  },
  puberty: { kind: 'G', stage: 4, assessedAtISO: '2026-10-03' },
  treatment: { gnrha: 'no', sexSteroids: 'no' }
}, VildaLabPubertyData);
// biochemical.byAge.status === 'above'
// biochemical.byStage.status === 'within'
// clinical.code === 'early_development'
// summary.status === 'attention'
```

Właściciel autoryzował realizację etapowego planu, obejmującego kolejne prace nad zapisem i UI. Akceptacja planu i makiety **nie jest walidacją kliniczną** ani potwierdzeniem przenoszalności norm na polskie laboratoria. Scalenie, publikacja i uruchomienie produkcyjne wymagają osobnego polecenia właściciela zgodnie z `AGENTS.md`; status nieaktywny w UI dotyczy zakresu PR1, nie zakazu kodowania następnych etapów. Rejestr nadrzędny: [ALGORITHMS.md](ALGORITHMS.md).

## Dwie oceny i wspólne podsumowanie

1. **Biochemia:** porównanie stężenia ze wskazanym zakresem właściwym dla próbki, metody, płci, wieku i ewentualnie stadium. Zakresy wieku i stadium pozostają odrębne; nie tworzy się ich przecięcia, sumy ani własnej obwiedni.
2. **Rozwój:** czas i charakter cech dojrzewania wobec wieku metrykalnego oraz wywiadu. Ta ocena jest niezależna od stężenia LH/FSH i metody jego oznaczenia.

Podsumowanie nie ma uniwersalnej kategorii „pacjent prawidłowy”. LH w zakresie dla G4 nie usuwa ostrzeżenia o G4 u sześciolatka. Prawidłowe FSH nie staje się z tego powodu „wysokie”. Niskie lub niewykrywalne LH nie wyklucza CPP. Silnik nie ustala centralnej/obwodowej etiologii, nie różnicuje KOWD/CDGP od CHH z jednej liczby i nie dobiera automatycznie MRI, leczenia ani protokołu stymulacyjnego [K1–K4].

## Wejście i czas badania

Poniższa tabela opisuje publiczny kontrakt silnika i starszych klientów, zachowany również dla odczytu historii. Formularz od `1.7.0` korzysta wyłącznie z `current-patient` i ograniczonego zestawu danych opisanego na początku dokumentu; nie udostępnia wszystkich wymienionych tu pól.

| Obszar | Kontrakt i ograniczenie |
|---|---|
| Analit i wynik | `lh` lub `fsh`; liczba, tekst albo obiekt `{operator, value}`. Operator `=`, `<`, `≤`, `>`, `≥` należy do wyniku. `<LOD`/`<LOQ` bez wartości nie otrzymują wymyślonego progu. Ujemna wartość lub nieznana jednostka są nieprawidłowym wejściem. |
| Jednostki | Kanoniczna `IU/L`; `mIU/mL` jest liczbowo równoważne. Równość jednostek nie dowodzi zgodności analizatorów. Klasyfikacja używa wartości niezaokrąglonych. |
| Wiek | W `contextBasis=sample`: `birthDateISO` i `sampleDateISO`, czyli rzeczywiste daty bez godziny, albo jawne `age` w dniu pobrania. W `current-patient`: jawny bieżący wiek z formularza, bez daty pobrania i bez przypisania go historycznej próbce. Oba tryby zachowują części i precyzję wieku; wiek kostny nie zastępuje metrykalnego. Kotwica wizyty jest osobną informacją. |
| Precyzja | Poprawne daty dają dokładny wiek; rachunek dat jest UTC i kalendarzowy. Rocznica 29 lutego w roku nieprzestępnym przypada na ostatni dzień lutego — jawna konwencja implementacyjna. Wpisane pełne lata/miesiące bez dokładnych dat opisują przedział wieku, nie pozornie dokładny punkt. Precyzja dzienna nie może powstać przez dopisanie brakujących danych. Nieprawidłowa data nie jest po cichu zastępowana ręcznym wiekiem. |
| Kontekst próbki | `sex`, `specimen`, `measurementKind`, metoda i potwierdzenie jej pochodzenia. W pierwszej wersji automatyczna ocena katalogowa dotyczy zgodnej metody, surowicy, oznaczenia bazalnego i znanego kontekstu bez GnRHa/steroidów płciowych. Nieznany kontekst pozostaje nieznany. |
| Obserwacja kliniczna | Stadium i/lub objętość jąder z typem i źródłem. Obserwacja wskazuje bieżący kontekst albo związek z próbką; są to odrębne znaczenia. Badanie wykonane później nie zastępuje badania z dnia dawnego oznaczenia. |
| Wywiad | Początek z typem zdarzenia i wiekiem/datą; progresja, przyspieszenie wzrastania, objawy OUN, regresja oraz leczenie, o ile są znane. Brak odpowiedzi nie oznacza „nie”. U niemowląt osobno wcześniactwo i wiek ciążowy. |

`parseMeasurement` zachowuje surowy zapis oraz jednostkę źródłową. Przy `<x`/`>x` liczba jest granicą raportowanego wyniku; `isExact` jest fałszywe, a `plotValue` puste. Wyniku nie wolno później rysować jako dokładnego punktu `x`. Porównanie całego zbioru możliwych wartości z granicami może dać `within`, `above`, `below` albo `indeterminate`; brak zgodnego zakresu daje `unavailable`. Brak interpretacji nie blokuje prawidłowej konwersji jednostek.

## Nomenklatura i kryteria rozwoju

Zaakceptowane oznaczenia UI: **Th/M** — rozwój piersi, **G** — rozwój narządów płciowych, **P** — owłosienie łonowe, **Ax** — owłosienie pachowe; skrót obserwacji, np. **Th3**, **G4**. Silnik normalizuje `Th/M/B` do `Th` i `P/PH` do `P`. To nazwy części badania, nie zamienne określenia jednego stadium.

P/Ax wskazują odrębną ocenę owłosienia; nie dowodzą gonadarche. Ax jest oceną dodatkową poza klasyczną skalą Tannera; ten moduł nie ustanawia skali Ax1–Ax5. Dawny sam numer „Tanner 3” bez typu pozostaje nieokreślony. Nie jest przepisywany na Th3/G3 na podstawie płci. Kryterium profilu to objętość jąder **≥4 mL** w badaniu orchidometrem Pradera; służy do oceny obecności początku, ale nie wyznacza całego stadium G i nie jest automatycznie przenoszone na każdą metodę USG [K2,K3,K5].

| Kryterium profilu klinicznego | Znaczenie |
|---|---|
| Potwierdzone Th≥2 przed 8. urodzinami | Wczesny rozwój piersi; izolowane początkowe Th2 ma komunikat o ocenie przebiegu, nie automatyczne CPP. Th3+, progresja lub inne niepokojące dane wymagają odrębnego ostrzeżenia. |
| Potwierdzone G≥2 / jądra ≥4 mL przed 9. urodzinami | Nieprawidłowy dla wieku początek rozwoju wymagający oceny; bez ustalenia etiologii. |
| Th1 od 13 lat / G1 lub brak powiększenia jąder od 14 lat | Ocena nieobecnego początku, z uwzględnieniem znanego wcześniejszego początku, regresji i leczenia. Sam brak danych o stadium nie jest stadium I. |
| Znany wczesny lub późny początek | Pozostaje częścią oceny mimo starszego obecnego wieku/stadium. Nie rekonstruować wieku początku z aktualnego stadium. |

Granice wczesnych cech to `<8/<9`; granice oceny nieobecnego początku to `≥13/≥14`. Dokładny początek w wieku 13/14 lat nie jest tym samym co brak początku w tej chwili. Przedział nieprecyzyjnego wieku przecinający granicę nie daje pewnego alarmu ani pewnego wykluczenia. Wytyczne Endocrine Society 2026 warunkowo dopuszczają obserwację niektórych dziewczynek z izolowanym Th2; nie są podstawą bezwarunkowej decyzji aplikacji o obserwacji, badań lub MRI [K1].

Opis katalogowy LHPED „delayed by age 12” u dziewcząt **nie jest** kryterium tego profilu. Kryteria kliniczne 13/14 pochodzą z odpowiednich źródeł klinicznych [K2–K4]; nie przenosi się ich razem z laboratoryjnym RI.

## Profile referencyjne Mayo w PR1

Poniższe wartości są w IU/L. Są to zakresy konkretnych oznaczeń Mayo, nie uniwersalne normy LH/FSH. Katalog nie podaje tu kompletnej charakterystyki kohort pozwalającej ogłosić walidację dla wszystkich populacji. Metoda próbki jest oddzielna od metody profilu: wybranie profilu nie potwierdza wykonania badania tą metodą.

### `mayo-lh-pediatric` — LHPED 62999

**AnshLite LH CLIA**, trzystopniowe oznaczenie sandwich, czułość analityczna 0,02 IU/L; metoda Mayo. Surowica [R1].

| Wiek katalogowy | M | F |
|---|---:|---:|
| <1 rok | <0,02–5,0 | <0,02–18,3 |
| 1–8 lat | <0,02–0,5 | <0,02–0,3 |
| 9–10 lat | <0,02–3,6 | <0,02–4,8 |
| 11–13 lat | 0,1–5,7 | <0,02–11,7 |
| 14–17 lat | 0,8–8,7 | <0,02–16,7 |

| Stadium katalogowe | M | F |
|---|---:|---:|
| I | <0,02–0,5 | <0,02–0,3 |
| II | 0,03–3,7 | <0,02–4,1 |
| III | 0,09–4,2 | 0,6–7,2 |
| IV–V | 1,3–9,8 | 0,9–13,3 |

Dolny zapis `<0,02` jest cenzorowany (`censoredLower`), a nie twardym minimum fizjologicznym 0,02. Nie generuje automatycznego „poniżej normy” dla wyniku `<0,02`. Grupa IV–V zachowuje wspólne liczby, bez interpolowania stadium.

Przedziały LH w pełnych latach mają jawną politykę `attained-year-band`: 1–8 → `[1,9)`, 9–10 → `[9,11)`, 11–13 → `[11,14)`, 14–17 → `[14,18)`. To zapis operacyjny ukończonych lat, nie dodatkowa dokładność oryginalnej publikacji. Niepewność wieku, która przecina granicę wierszy, nie jest usuwana zaokrągleniem ani przejściem do innej normy. Katalogowy kwalifikator stadium I „1–8 lat” także pozostaje `[1,9)`; tego wiersza nie rozszerza się na starsze dzieci. Zakres profilu LHPED kończy się przed 18. urodzinami.

### `mayo-fsh-pediatric` — FSH 602753

**Roche Elecsys FSH ECLIA**, oznaczenie sandwich; surowica. Katalog cytuje package insert 09/2021 [R2].

| Wiek katalogowy | M | F |
|---|---:|---:|
| <12 miesięcy | ≤3,3 | 1,2–12,5 |
| 12 miesięcy–5 lat | ≤1,9 | 0,5–6,0 w grupie 12 miesięcy–10 lat |
| >5–10 lat | ≤2,3 | 0,5–6,0 w grupie 12 miesięcy–10 lat |
| >10–15 lat | 0,6–6,9 | 0,9–8,9 |
| >15–18 lat | 0,7–9,6 | 0,7–9,6 |

| Stadium | M | F |
|---|---:|---:|
| I | <1,5 | 0,6–4,1 |
| II | <3,0 | 0,3–5,8 |
| III | 0,4–6,2 | 0,1–7,2 |
| IV | 0,6–5,1 | 0,3–7,0 |
| V | 0,8–7,2 | 0,4–8,6 |

Granice wieku FSH zachowują dosłowne relacje katalogu, np. `>5–≤10`, bez zamiany na przedziały ukończonych lat LH. Profil obejmuje dokładnie 18 lat, inaczej niż LHPED. `<1,5` i `<3,0` są jednostronnymi górnymi granicami stadium M, bez dopisywania arbitralnego dolnego RI. `<` i `≤` pozostają różnymi operatorami. Zakresy płciowe nie są zastępowane wspólną tabelą, a stadium V nie uruchamia automatycznie norm faz cyklu dorosłych.

W obu profilach `stageAgeMinYears:1` oznacza politykę wyboru wyłącznie zakresu wieku u niemowląt, a nie biologiczny koniec minipuberty. Nie stosuje się starszego zakresu stadium jako zastępstwa dla brakującej referencji niemowlęcej.

**Poza tą ratą:** standardowy LH Mayo 602752 jest odrębnym oznaczeniem Roche ECLIA [R3], z innymi zakresami i brakiem ustanowionego RI dla ≤4 tygodni. Jego zakresy ani dorosłe fazy LH/FSH nie są zamiennikiem LHPED i nie są aktywowane w PR1. W szczególności nie wolno używać domyślnego `life_stage='adult'` przy brakującym wieku. Lokalny zakres może mieć pierwszeństwo jedynie po podaniu jawnego źródła, wersji, metody, populacji, granic i potwierdzonej przydatności dla tej próbki; nie powstaje przez zgadywanie.

## Minipuberty

To osobny kontekst fizjologiczny, nie diagnoza z wysokiego LH/FSH i nie automatyczne wyłączenie ostrzeżeń. Zaawansowane/postępujące cechy Th/G nadal wymagają oceny. Izolowane Th2 w niemowlęctwie ma odrębny komunikat kontekstowy. Szeroki katalogowy przedział `<1 rok` może być użyty wyłącznie z właściwą metodą i jawnym opisem rozdzielczości; nie zastępuje krzywej kolejnych dni/miesięcy [M1].

**Johannsen 2018 pozostaje kandydatem zablokowanym do automatycznej interpretacji.** Wiek źródłowy 2–5 miesięcy, dokładne zaliczenie 2,0/3,5/5,0 miesięcy, LOD i przeniesienie na lokalny assay nie są dopowiadane. Poniższe przedziały odczytano wtórnie z tabeli 1 Rohayem 2024; metoda AutoDELFIA/PerkinElmer i statystyka P2,5–P97,5 po transformacji logarytmicznej są opisane w tabeli 2 Olthof 2026 [M1,M2,M4]. Nie są aktywną alternatywą Mayo.

| Płeć i wiek raportowany | LH, P2,5–P97,5 IU/L (n) | FSH, P2,5–P97,5 IU/L (n) |
|---|---:|---:|
| M, 2,0–3,5 mies. | 0,62–4,08 (581) | 0,41–3,02 (578) |
| M, 3,5–5,0 mies. | 0,54–3,32 (166) | 0,42–2,68 (165) |
| F, 2,0–3,5 mies. | <LOD–0,98 (432) | 1,23–17,4 (435) |
| F, 3,5–5,0 mies. | <LOD–1,25 (110) | 1,30–17,7 (111) |

Nie rozszerzać tych danych na 0–2/5–12 miesięcy, nie interpolować między analizatorami ani nie stosować ich do moczu lub wcześniaków. Przy wcześniactwie potrzebna jest właściwa źródłowa oś wieku, a nie samodzielna zamiana wieku chronologicznego na skorygowany. Definicja WHO w profilu danych to urodzenie przed ukończeniem 37 tygodni (`<37`), nie `≤37` [K6]. Definicja ta nie jest normą gonadotropin ani zgodą na automatyczne przeliczanie wieku próbki.

Poprawne cytowanie **Andersson 1998** to PMID 9467591, DOI 10.1210/jcem.83.2.4603, JCEM 83(2):675–681 [M3]. Odczytano abstrakt; pełny oryginał był niedostępny. Tabela 1 Rohayem podaje zakresy **obserwowane**, nie centralne 95% RI: np. LH M w 3 mies. 0,90–2,64 i 6 mies. 0,16–1,07; FSH F odpowiednio 0,48–24,0 i 1,68–8,71 IU/L. Badanie 15 dzieci każdej płci, ocenianych co 3 miesiące, nie uzasadnia dawnych wspólnych przedziałów LH M 1–6 ani FSH F 1–8 w całym 1.–6. miesiącu. Błędny PMID 9814500 nie jest źródłem tego badania.

## Wynik, wersje i przyszły zapis

`evaluate` zwraca `schemaVersion:1`, wersje silnika/danych, kopię znormalizowanego wejścia, `measurement`, `ageAtSample`, osobne `biochemical` i `clinical`, `summary`, `provenance` i `limitations`. Porównania zawierają pełny wybrany zakres z metadanymi, nie tylko ID. `unavailable`, `indeterminate`, brak oceny i brak alarmu czasu nie są kategorią „normalny pacjent”. Próbka po stymulacji, leczenie lub nieznana metoda nie kasują niezależnych informacji klinicznych.

`biochemical.byAge`, `byStage` i `local` są obiektami porównania `{status, reasonCodes, range}`; `range` jest puste przy braku zakresu. Wybrany zakres zawiera `bounds` z operatorami oraz kopię źródła, populacji i metody. `primary` wskazuje `local`, `stage`, `age` lub `null`; nie usuwa pozostałych ocen. `summary.status` ma wartości `attention`, `limited`, `compared`, `invalid`, `out_of_scope`. Ostrzeżenie kliniczne może pozostać widoczne przy nieprawidłowo wpisanej liczbie; `measurement.status` i niedostępność biochemii nadal jawnie wskazują błąd liczby.

Opcjonalny `localReference` ma pola `id`, `version`, `analyte`, `material`, `unit`, `methodId`, `source:{id,label,version,url}`, `population:{label}`, `applicabilityConfirmed` i `range:{lower,upper,censoredLower,sourceText}`. Każda granica to `{operator,value}` lub `null`. Potwierdzenie przydatności dotyczy konkretnej próbki; sama nazwa laboratorium nie wystarcza. Źródła zewnętrzne w wyjściu są tekstem do bezpiecznego wyświetlenia, nigdy poleceniem ani HTML do wykonania.

Lokalny zakres nie rozszerza pediatrycznego zakresu wieku modułu. Wymaga ustanowionego `clinicalProfile.scopeAgeYears` i zgodnego wieku; katalog może korzystać z własnego zakresu wieku przy niedostępnych regułach klinicznych. Gdy ważny lokalny zakres jest podstawą oceny, rozstrzyga biochemiczną część podsumowania. Różnica względem pomocniczego zakresu katalogowego pozostaje w obu porównaniach i kodzie `source_reference_disagreement`; nie nadaje lokalnie prawidłowemu wynikowi etykiety „poza wskazanym zakresem”. Niezależne ostrzeżenie kliniczne ma nadal pierwszeństwo.

W PR2 opcjonalny snapshot oceny przechodzi przez przypięcie, whitelist sejfu, import, serie, kartę i edytory. Zachowuje surowy wynik/operator/jednostkę, kontekst dnia pobrania, źródło/metodę/populację, granice z operatorami i zapisane oceny. Nie może zależeć od późniejszych zmian wejścia ani danych referencyjnych. Nie zawiera HTML, referencji DOM, `patientId` ani dat wymyślonych przez silnik. Sam komentarz zachowuje snapshot; zmiana wyniku, daty, kontekstu lub profilu wymaga przeliczenia albo jawnego unieważnienia.

PR3 uruchamia wspólnie UI, producenta snapshotu, treści ostrzeżeń i odczyt ocen. **Bez backfill:** dawne wyniki bez snapshotu nie otrzymują domniemanego Th/G, metody ani dzisiejszego kontekstu. Jawnej niedostępnej oceny nie zastępuje stary trendowy `evaluate` z samą płcią i wiekiem.

## PR3 — aktywacja w dotychczasowym układzie przelicznika

Trzecia partia włącza dane i silnik PR1 oraz transport PR2 dla **LH i FSH**. Zachowuje dotychczasowy układ `przelicznik-jednostek.html`: kroki 1–5, dużą wartość wyniku, jednostkę docelową, przeliczenia i położenie sekcji wyniku również na telefonie. Nie wprowadza osobnej strony, dwóch nowych kolumn ani nowej karty wyniku. Dodatkowe pola trafiają do istniejących sekcji próbki i pacjenta; szczegóły pozostają rozwijane. Pozostałe anality zachowują dotychczasową prezentację.

Czytelny `vilda_lab_puberty_ui.js` zbiera kontekst pojedynczego oznaczenia i wywołuje istniejące `VildaLabPuberty.evaluate(input, data)`. `vilda_lab_assessment_ui.js` prezentuje bieżącą i zapisaną ocenę bez ponownego obliczania historii. Stare `selectRange`, pojedynczy pasek/kolor `far_above` oraz nieadekwatne objaśnienia LH/FSH nie stanowią alternatywnej interpretacji nowej ścieżki.

W sekcji wyniku są rozdzielone: komunikat o rozwoju względem wieku, porównanie stężenia z zakresem wieku oraz ze stadium (i kompletnym lokalnym zakresem, jeżeli podano). Zgodność z zakresem stadium nie usuwa ostrzeżenia klinicznego i nie oznacza „pacjent prawidłowy”. FSH mieszczące się w zakresie nie otrzymuje koloru/etykiety wysokiego stężenia tylko dlatego, że czas rozwoju wymaga oceny. Brak metody, normy lub danych nie blokuje prawidłowej konwersji, lecz pozostawia jawną niedostępność odpowiedniego porównania. Ostrzeżenie rozwoju może być widoczne przed wpisaniem liczby.

Pola próbki nie otrzymują domyślnych potwierdzeń metody, surowicy, oznaczenia bazalnego ani braku leczenia. Wybranie profilu referencyjnego jest odrębne od potwierdzenia rzeczywistej metody próbki. Wiek w dniu pobrania pochodzi z dat albo z jawnych części wieku i ich precyzji; formularz nie dopisuje daty pobrania. Dane bieżącego pacjenta są oznaczonym źródłem i wymagają świadomego użycia dla tej próbki. Sam dawny numer Tannera pozostaje nieokreślony, bez domyślnego Th/G; kategoria objętości jąder nie staje się dokładną liczbą ani pomiarem Pradera. Zmiana pacjenta i reset usuwają lokalne potwierdzenia, a zmiana LH ↔ FSH usuwa metodę poprzedniego oznaczenia.

Przypięcie przechwytuje kopię bieżącej oceny. Dialog pokazuje jej podgląd i wyjaśnia unieważnienie po zmianie daty. Widoki wizyt, przypiętych wyników, terminarza i historii odczytują tę kopię, także gdy bieżące dane pacjenta się zmieniły. Wyniki `<x`, `>x` i `<LOD` mają czytelny zapis tekstowy i nie są punktami na granicy oznaczenia. Unieważniona ocena jest jawnie nieaktualna; jej wcześniejsza treść jest dostępna jako szczegół historyczny. Brak pola `assessment` nadal oznacza starszy zapis, bez backfill.

**Wpływ kliniczny:** aktywacja zmienia widoczne interpretacje LH/FSH względem dawnego przelicznika. Nie zmienia liczb, tabel, jednostek, progów ani wersji silnika/danych PR1; uruchamia ich uzgodnione ograniczenia metodyczne i rozdzielenie ocen. Źródła, populacje, kryteria i przypadki syntetyczne są opisane poniżej. Testy techniczne nie stanowią walidacji klinicznej; przegląd kliniczny, scalenie i wdrożenie pozostają decyzją właściciela.

### Spójność źródła danych pacjenta

`VildaPubertySource.kontekstPacjenta(patientId)` zwraca status `ready`, `loading` albo `unavailable` wraz z kontekstem powiązanym z tym pacjentem. Import z karty jest dostępny wyłącznie dla zgodnego, zakończonego odczytu. Każde nowe żądanie oraz blokada lub wyczyszczenie sesji unieważniają wcześniejsze odczyty. Identyfikator w `sessionStorage` ma pierwszeństwo przed lokalnym stanem ramki.

Zmiana kontekstu usuwa wartości nadal pochodzące z poprzedniego importu i wymaga ponownego potwierdzenia ich przydatności. Podczas ponownego odczytu dane importowane są wyłączone z oceny. Mogą wrócić po zakończeniu odczytu wyłącznie przy identycznym kontekście; nie nadpisują ręcznych zmian dokonanych w tym czasie. Ręczna korekta pola oznacza niezależne dane próbki i nie jest nadpisywana przez późniejszy odczyt karty. Aktualność źródła jest sprawdzana również bezpośrednio przed importem oraz utworzeniem nowej oceny. Niedostępność karty pozwala wpisać dane próbki ręcznie; nie oznacza braku leczenia. Ta poprawka nie zmienia reguł klinicznych ani utrwalonych ocen.

## PR2 — transport historycznej oceny

PR2 dodaje czytelny moduł `vilda_lab_snapshot.js` (`VildaLabSnapshot`, wersja `1.0.0`) ładowany przed sejfem, także przez oba mechanizmy ładowania na żądanie. Silnik i dane PR1 nadal **nie są ładowane** przez aplikację ani precache. Przelicznik nie produkuje jeszcze nowych ocen; ich tworzenie i prezentację włącza dopiero PR3.

Opcjonalne pole `labResult.assessment` ma kontrakt:

```js
{
  schemaVersion: 1,
  status: 'recorded', // albo 'invalidated' / 'unavailable'
  reasonCodes: [],
  evaluation: { /* kopia kompletnego wyniku evaluate z PR1 */ },
  binding: { /* pola wyniku i clinicalDateISO, ustalane przy zapisie */ }
}
```

`create(evaluation, binding?)` przygotowuje kopię, `normalize(assessment)` weryfikuje ją bez ponownej oceny klinicznej, `reconcile(previousLab, nextLab, previousDateISO, nextDateISO)` obsługuje edycję, a `forSeries(lab, dateISO)` przygotowuje odczyt serii. Wszystkie funkcje działają bez DOM, zegara, magazynów i dostępu do aktualnego pacjenta lub norm. Każdy poziom obiektu ma listę dozwolonych pól; kopia nie przenosi identyfikatorów pacjenta, HTML, obiektów DOM ani dowolnych rozszerzeń. Nieznana lub uszkodzona wersja pozostawia jawny status `unavailable`, zamiast zmieniać wpis w starszy wynik bez oceny.

Ocena przechodzi przez szyfrowany zapis notatki przypiętej do wizyty, odczyt notatek, eksport/import synchronizacji, historię pacjenta i serie laboratoryjne. `linkedAgeMonths` jest kotwicą wizyty; nie zastępuje `evaluation.ageAtSample` ani daty pobrania. Późniejsza zmiana wieku, stadium, leczenia lub norm w aktualnym formularzu nie zmienia zapisanej oceny.

Edytory karty i terminarza zachowują pierwotny wynik, gdy zmienia się tylko komentarz. Zmiana pól wyniku, jednostki, normy albo daty badania unieważnia ocenę; ponowne zapisanie starego obiektu nie przywraca jej ważności. Nowa ocena musi odpowiadać zapisywanemu wynikowi i dacie. Status unieważnienia pozostawia historyczną ocenę do odczytu, lecz nie pozwala użyć jej jako aktualnej interpretacji.

Przypinanie udostępnia nieaktywny domyślnie punkt integracji `VildaLabPinResult.setAssessmentProvider(fn|null)`. Producent PR3 zwróci ocenę przy otwarciu dialogu; dialog przechowuje jej kopię, a sejf weryfikuje zgodność przy zapisie. Brak producenta zachowuje dotychczasowe przypinanie. Dla jawnego snapshotu `labResult.value` zawiera surowy wynik (np. `<0,02`), a jednostka jest osobnym polem; tekst konwersji pozostaje w treści notatki. Starsze przypięcie zachowuje dotychczasowy złożony tekst wyniku. Dialog przyjmuje znaną datę próbki jako datę badania; późniejsza zmiana tej daty unieważnia przechwyconą ocenę, również gdy podano sam wiek bez daty próbki. Kod tej partii nie rejestruje producenta.

**Zgodność starszych danych:** brak pola `assessment` pozostaje brakiem pola, bez masowej migracji i bez dopisywania Th/G, metody, leczenia lub daty. Stare serie zachowują dotychczasową ścieżkę. Wpis z jawną oceną nie wywołuje starego `LabUnitConverter.evaluate` z aktualną płcią i wiekiem. Wynik cenzorowany (`<x`, `<LOD`, `>x`) zachowuje operator i surowy zapis; nie staje się dokładnym punktem trendu na granicy oznaczenia. Prezentacja nowych ocen, ostrzeżeń i cenzorowanych wyników należy do PR3.

Wpływ kliniczny PR2: brak zmian liczb, progów i interpretacji dotychczasowego UI. Dodane zachowanie chroni kontekst nowych zapisów przed utratą lub nieuprawnioną reinterpretacją. Nie jest walidacją medyczną silnika PR1. Wycofanie konsumenta wymaga zachowania dodatkowego pola w kopiach danych; starsza wersja aplikacji może je odrzucić w swojej kopii danych, dlatego nie jest zgodnym edytorem nowych ocen. Bieżący sejf przy scalaniu zachowuje posiadaną ocenę, jeśli starszy klient pominął pole przy zmianie komentarza; zmiana wyniku lub daty przez starszego klienta ją unieważnia. Bez załadowanego modułu transportu odczyt pozostaje jawnie niedostępny, a zapis istniejącej oceny jest blokowany, aby nie utrwalić utraty kontekstu.

Testy PR2: `tests/unit/lab-snapshot.test.mjs` (model), `lab-snapshot-vault.test.mjs` (rzeczywisty sejf, szyfrowanie, import i synchronizacja), `lab-snapshot-ui.test.mjs` (produkcyjne funkcje przypięcia i trendów) oraz `tests/e2e/lab-snapshot.spec.mjs` (przypięcie, przeładowanie, edytory i historia w Chromium).

## Syntetyczne przypadki akceptacyjne

To wymagania dla testów rzeczywistych funkcji produkcyjnych, nie deklaracja wykonania ani walidacji klinicznej. Przypadki liczbowe zakładają właściwy profil/metodę, surowicę, oznaczenie bazalne i potwierdzony kontekst bez leczenia; wiek i obserwacja odnoszą się do tej samej próbki, chyba że podano inaczej.

| Wejście | Wymagana własność wyniku |
|---|---|
| M6 lat, G4, LH2 | `within` względem stadium 1,3–9,8; `above` względem wieku z górną granicą 0,5; ostrzeżenie kliniczne zachowane. |
| M6 lat, G4, FSH2 | W zakresie stadium 0,6–5,1 i wieku ≤2,3; ostrzeżenie rozwoju, bez fałszywego „FSH wysokie”. |
| F4 lata, Th3 | Ostrzeżenie o rozwiniętych cechach przed granicą wieku, bez rozpoznania centralnej etiologii. |
| F7,5 lat, izolowane Th2, progresja nieznana | Informacja o wczesnym rozwoju piersi i ograniczeniu oceny przebiegu; bez automatycznej decyzji CPP/MRI/obserwacja. |
| F7 lat, Th3, LH<LOD | Brak wymyślonej liczby/punktu trendu; niskie LH nie kasuje ostrzeżenia klinicznego. |
| F8,0 / M9,0, początek teraz | Nie spełnia `<8/<9`; brak ogólnego zapewnienia prawidłowości. |
| F13 Th1 / M14 G1, brak wcześniejszego początku, regresji i leczenia | Ocena nieobecnego początku na dokładnej granicy. |
| F10 lat, znany początek Th w wieku 7 lat | Zachowana historia wczesnego początku mimo obecnego wieku. |
| P3 lub Ax bez Th/G; legacy „Tanner 3” | Bez automatycznego podstawienia gonadalnego stadium i bez domyślnego stadium I. |
| M3 mies., LH2, zgodne LHPED | Porównanie do szerokiego `<1 rok`, jawny kontekst minipuberty; nie uniwersalny próg LH0,3. |
| F3 mies., FSH12, kandydat Johannsen | Kandydat pozostaje zablokowany; nieaktywny przedział 1,23–17,4 nie staje się automatyczną normą. |
| FSH M stadium I, wynik dokładnie 1,5 | Nie spełnia górnego ograniczenia `<1,5`; operator nie jest zamieniany na `≤`. |
| Nieprecyzyjny wiek przecina granicę RI lub kryterium klinicznego | Jawna niejednoznaczność; bez zaokrąglenia do wygodnego wiersza. |
| Późniejsza ocena G4 przy dawnym pobraniu | Brak automatycznego zastosowania przyszłej obserwacji. |
| Brak wieku/metody, stymulacja, GnRHa, próbka moczu lub wcześniactwo bez odpowiedniego profilu | Jawne ograniczenie lub brak dopasowanej oceny; brak zastępczej normy dorosłych. |
| Mutacja wejścia/danych po obliczeniu; zapis/odczyt przyszłego snapshotu | Zachowana historyczna ocena i operatory; bez ponownej oceny według bieżącego pacjenta. |

## Źródła i rzeczywisty zakres odczytu

Katalogi odczytano 2–3.10.2026. Rozdzielono odczyt oryginału, abstraktu i wtórnej tabeli; status dostępu nie jest oceną jakości badania.

- **R1:** Mayo Clinic Laboratories, [LHPED 62999](https://www.mayocliniclabs.com/test-catalog/Overview/62999). Odczytano pełny aktualny katalog, `Reference Values`, `Method Name/Description`, `Clinical Information`, `Cautions` i przykładowy raport. Źródło liczb i metody LH pediatrycznego.
- **R2:** Mayo Clinic Laboratories, [FSH 602753](https://www.mayocliniclabs.com/test-catalog/Overview/602753). Pełny katalog i przykładowy raport; `Reference Values`, metoda Roche Elecsys ECLIA, przywołany package insert 09/2021. Nie deklarujemy niezależnego odczytu pełnego insertu.
- **R3:** Mayo Clinic Laboratories, [LH 602752](https://www.mayocliniclabs.com/test-catalog/Overview/602752). Pełny katalog i przykładowy raport; odrębne standardowe Roche LH. Źródło audytu różnic, nie aktywny zamiennik R1.
- **K1:** Latronico AC i wsp. *Central precocious puberty: an Endocrine Society clinical practice guideline.* JCEM 2026. [PMID 42287186](https://pubmed.ncbi.nlm.nih.gov/42287186/), [DOI 10.1210/clinem/dgag168](https://doi.org/10.1210/clinem/dgag168). Odczytany abstrakt oraz [oficjalne rekomendacje z uwagami technicznymi](https://www.endocrine.org/clinical-practice-guidelines/central-precocious-puberty); pełny artykuł wydawcy niedostępny. Nie utożsamiano strony rekomendacji z pełnym odczytem uzasadnienia GRADE.
- **K2:** Persani L i wsp. *ENDO-ERN expert opinion on the differential diagnosis of pubertal delay.* Endocrine 2021. [PMID 33512657](https://pubmed.ncbi.nlm.nih.gov/33512657/), DOI 10.1007/s12020-021-02626-z, [pełny tekst PMC8016789](https://pmc.ncbi.nlm.nih.gov/articles/PMC8016789/). Odczytano definicje i różnicowanie.
- **K3:** Howard SR. *Interpretation of reproductive hormones before, during and after the pubertal transition—Identifying health and disordered puberty.* Clin Endocrinol 2021;95:702–715. [PMID 34368982](https://pubmed.ncbi.nlm.nih.gov/34368982/), DOI 10.1111/cen.14578, [pełny tekst PMC9291332](https://pmc.ncbi.nlm.nih.gov/articles/PMC9291332/). Odczytano fizjologię, definicje i tabele 2–4.
- **K4:** Bangalore Krishna K, Garibaldi L. *Critical appraisal of diagnostic laboratory tests in the evaluation of central precocious puberty.* Front Pediatr, online 21.01.2025, tom/DOI 2024. [PMID 39911767](https://pubmed.ncbi.nlm.nih.gov/39911767/), DOI 10.3389/fped.2024.1504874, [pełny tekst PMC11795171](https://pmc.ncbi.nlm.nih.gov/articles/PMC11795171/). Odczytano części merytoryczne, tabelę 1 i Box 1; narracyjny przegląd, nie wspólna walidacja progów wszystkich assay.
- **K5:** Rosenfield RL. *Normal and Premature Adrenarche.* Endocr Rev 2021. [PMID 33788946](https://pubmed.ncbi.nlm.nih.gov/33788946/), DOI 10.1210/endrev/bnab009, [pełny tekst PMC8599200](https://pmc.ncbi.nlm.nih.gov/articles/PMC8599200/). Źródło odrębności adrenarche/gonadarche; nie źródło automatycznego wykluczenia CPP niskim LH.
- **K6:** World Health Organization. *Preterm birth*, fact sheet 10.05.2023, [oficjalna strona](https://www.who.int/news-room/fact-sheets/detail/preterm-birth). Odczytano `Overview`, definicję urodzenia przed 37 ukończonymi tygodniami ciąży; dostęp 3.10.2026. Źródło definicji wcześniactwa, nie tabel LH/FSH ani reguł przenoszenia norm między osiami wieku.
- **M1:** Rohayem J, Alexander EC, Heger S, Nordenström A, Howard SR. *Mini-Puberty, Physiological and Disordered: Consequences, and Potential for Therapeutic Replacement.* Endocr Rev 2024. [PMID 38436980](https://pubmed.ncbi.nlm.nih.gov/38436980/), DOI 10.1210/endrev/bnae003, [pełny tekst PMC11244267](https://pmc.ncbi.nlm.nih.gov/articles/PMC11244267/). Odczytano pełne części merytoryczne; tabela 1 jest wtórnym źródłem liczb M2/M3, z zachowaniem ich różnych statystyk.
- **M2:** Johannsen TH i wsp. *Sex Differences in Reproductive Hormones During Mini-Puberty in Infants With Normal and Disordered Sex Development.* JCEM 2018. [PMID 29917083](https://pubmed.ncbi.nlm.nih.gov/29917083/), DOI 10.1210/jc.2018-00482. Odczytany abstrakt i metadane: 1840 zdrowych niemowląt oraz 27 dzieci z DSD, wiek 2–5 miesięcy. Pełny oryginał niedostępny; liczby zdrowych grup odczytano z M1, metodę/statystykę z M4.
- **M3:** Andersson AM i wsp. *Longitudinal reproductive hormone profiles in infants: peak of inhibin B levels in infant boys exceeds levels in adult men.* JCEM 1998;83(2):675–681. [PMID 9467591](https://pubmed.ncbi.nlm.nih.gov/9467591/), DOI 10.1210/jcem.83.2.4603. Zweryfikowane metadane i abstrakt; pełny oryginał niedostępny. Zakresy obserwowane odczytano wtórnie z M1, nie przekształcono ich w RI.
- **M4:** Olthof A i wsp. *A literature overview of age- and Tanner stage-specific reference intervals for sex hormones for children aged 0–18 years.* J Mol Endocrinol 2026;77(2). [PMID 42554720](https://pubmed.ncbi.nlm.nih.gov/42554720/), DOI 10.1530/JME-26-0037, [pełny tekst PMC13506540](https://pmc.ncbi.nlm.nih.gov/articles/PMC13506540/). Odczytano Methods, Results, Discussion i tabele 1–2; suplement PDF niedostępny. Heterogeniczność populacji, metod, ocen stadium i statystyk ogranicza łączenie danych.
