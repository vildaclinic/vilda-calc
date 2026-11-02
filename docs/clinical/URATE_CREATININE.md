# KM/Cr — kwas moczowy/kreatynina w moczu

Właściciel zaakceptował [makietę przed/po na desktopie i telefonie](https://vilda-kmcr-20261101.maciej-flader.chatgpt.site)
i polecił kodowanie **02.11.2026**, z usunięciem dodatkowego zdania o kamicy
i ocenie wydalania dobowego z głównego wyniku. Zatwierdzony komentarz dla
podwyższonego wyniku brzmi: **„Podwyższony KM/Cr może wskazywać na zwiększone
wydalanie kwasu moczowego.”** Pozostały zakres makiety zachowano.

Moduł zmienia interpretację, jednostki, reguły dokładności i zapis; nie jest
wyłącznie poprawką wyglądu. Testy nie nadają mu statusu niezależnej walidacji
klinicznej. Baza rozpoczęcia implementacji: `6298d776630dead4a45f2d6b4b3c54d5285cd309`.

## Źródło zakresów i jego ograniczenia

Jedyny domyślny profil pochodzi z **Newcastle Hospitals Laboratories,
Urate, urine**, sekcje **Specimen container paediatric/adult** oraz
**Reference ranges → Random urine sample**:
[pełny katalog](https://laboratories.newcastle-hospitals.nhs.uk/test-directory/urate-urine/).
Aktualizacja strony: **24.12.2024**; pełny odczyt podczas audytu:
**01.11.2026**. Dane są ręczną transkrypcją tabeli katalogowej, sprawdzoną
niezależnymi odczytami w audycie.

Materiał odniesienia to **próbka jednorazowa moczu** (`random urine`),
jednostka **mmol/mmol kreatyniny**, bez podziału płci. Katalog nie podaje
liczebności i kryteriów doboru kohorty, percentyli, metody oznaczania,
daty wyznaczenia zakresów ani odrębnej walidacji wcześniaczej lub
noworodkowej. Nie przypisuje się tych nieznanych cech próbce pacjenta.
To nazwany, orientacyjny zakres danego laboratorium, nie uniwersalna norma
każdej populacji.

| Oryginalna etykieta wieku | Jawna mapa aplikacji | Zakres mmol/mmol |
| --- | --- | ---: |
| Up to 2 years | 0–<2 lata | 0,42–1,53 |
| 2 to 5 years | 2–<6 lat | 0,57–1,35 |
| 6 to 9 years | 6–<10 lat | 0,39–0,85 |
| 10 to 17 years | 10–<18 lat | 0,15–0,67 |
| >17 years | ≥18 lat | 0,11–0,53 |

**Konwencja aplikacji zaakceptowana wraz z makietą:** grupy zapisane całymi
latami traktuje się jako ukończone lata, bez interpolacji i zaokrąglania
wieku w górę. Nakładające się słowne etykiety przy 2 latach rozstrzyga się
na rzecz grupy jawnie zaczynającej się od 2 lat. Dokładnie 2 lata należą
więc do `2 to 5 years`. Obie liczbowe granice przedziału są włączone.
Katalog nie definiuje formalnie tych predykatów ani inkluzywności; są one
jawną polityką aplikacji, nie dodatkową dokładnością źródła.
`sourceAgeLabel` zachowuje oryginalną etykietę obok predykatów aplikacji.

Wiek pochodzi z istniejących danych pacjenta, z zachowaniem dostępnych
miesięcy/dni. Nie dodaje się nowego wymaganego pola wieku. Brak właściwego
wieku lub materiału pozostawia poprawną liczbę bez automatycznej oceny;
nie uruchamia normy dorosłych lub innego laboratorium. Nie miesza się
zakresów Newcastle z Mayo, Gloucester lub Seattle.

Dane referencyjne znajdują się w `clcr_urate_creatinine_data.js`, oddzielnie
od bezstanowego silnika `clcr_urate_creatinine.js`. Silnik otrzymuje politykę
jako argument. Wynik niesie źródło, populację, wersję polityki, materiał,
wybrany przedział, obie granice i ich inkluzywność oraz ograniczenia.
Pozwala to później obsługiwać inne zweryfikowane populacje bez zaszywania
domyślnej normy w równaniu.

## Próbka jednorazowa a DZM

Iloraz stężeń można obliczyć także dla próbki pobranej z wymieszanej
zbiórki dobowej. [LOINC 13820-6](https://loinc.org/13820-6/), wersja 2.80
odczytana w audycie, określa stosunek moczanów do kreatyniny w moczu z 24 h.
Nie jest więc poprawne twierdzenie, że taki wskaźnik nie dotyczy DZM.
Samo wspólne równanie nie czyni jednak zakresu próbki punktowej właściwym
dla zbiórki czasowej.

Newcastle oddzielnie podaje dorosłe wydalanie **1,5–4,5 mmol/24 h**.
To ilość dobowa, nie norma KM/Cr. Publiczny katalog
[Quest 907](https://testdirectory.questdiagnostics.com/test/test-detail/907/uric-acid-24-hour-urine-with-creatinine?cc=MASTER)
oraz [Warde UUAQ](https://wardelab.com/test/uric-acid-24-hour-urine-with-creatinine/)
odsyłają po właściwy zakres do raportu laboratorium. Pojedynczy przykładowy
raport nie ustala uniwersalnego profilu wieku/płci. Nie stwierdza się, że
normy dla DZM nigdzie nie istnieją; aplikacja nie ma w tej polityce
zweryfikowanego zakresu KM/Cr dla DZM.

Jedna pozycja `KM_Cr` znajduje się przy stosunkach do kreatyniny w
obliczeniach z próbki moczu. Nowy formularz jawnie pokazuje
**„Próbka jednorazowa”** z opcją **„Zmień”** na DZM. W obu przypadkach
pozostają te same dwa stężenia. Zmiana materiału wpływa na dostępność
normy, nie na równanie ani szerokość formularza. Dla DZM lub historycznie
nieznanego rodzaju próbki wynik jest neutralny, bez przeniesionej normy
punktowej. Nie tworzy się drugiego kalkulatora ani nowego identyfikatora
pomiaru dla innego materiału lub jednostki.

## Minimalne dane i jednostki

Pierwszy, domyślny tryb **„Oblicz ze stężeń”** wymaga tylko kwasu moczowego
i kreatyniny w tej samej próbce moczu. Drugi tryb **„Gotowy wynik KM/Cr”**
wymaga jednego stosunku z jednostką raportu. Wspólna próbka jest opisanym
założeniem; jawnie znanej sprzeczności pochodzenia nie wolno zamienić
w potwierdzenie zgodności. Nie są potrzebne czas, objętość, masa ciała,
wzrost, płeć ani stężenia we krwi.

Każde stężenie ma cztery różne jednostki: **mg/dL, mg/L, mmol/L, µmol/L**.
Wybór jednostki określa znaczenie wpisanej liczby zgodnie z raportem;
kontrolka nie przeskalowuje samoczynnie wartości w polu. Gotowy stosunek
obsługuje **mmol/mmol, mg/mg, mg/g**. Główny wynik ma stałą jednostkę
**mmol/mmol**, taką samą jak wyświetlana norma i tabela Szczegółów.

Po uzgodnieniu jednostek:

`R_mol = U_kwas_moczowy [mmol/L] / U_kreatynina [mmol/L]`

`R_mass = U_kwas_moczowy [mg/L] / U_kreatynina [mg/L]`

`R_mol = R_mass × 113,12 / 168,11`

Przyjęta spójna para mas molowych to **168,11 g/mol** dla kwasu moczowego
i **113,12 g/mol** dla kreatyniny. Są to dwucyfrowe zaokrąglenia wartości
z NIST Chemistry WebBook SRD69:
[kwas moczowy 168,1103](https://webbook.nist.gov/cgi/cbook.cgi?ID=69-93-2)
oraz [kreatynina 113,1179](https://webbook.nist.gov/cgi/cbook.cgi?ID=60-27-5).
Nie miesza się ich z niezależnie zaokrąglonymi współczynnikami µmol/L.
`mg/g = 1000 × mg/mg`; `mg/dL ×10 = mg/L`; `µmol/L ÷1000 = mmol/L`.

W DZM wspólne czynniki `objętość ×24/czas` skracają się w ilorazie obu
ilości. Nie są dodatkowymi wymaganymi danymi stosunku. Wynik nie jest
wyrażony w mmol/24 h ani nie staje się dobowym wydalaniem przez samą
normalizację do kreatyniny.

## Dokładność, walidacja i prezentacja

Kwas moczowy i gotowy stosunek muszą być **≥0**, kreatynina **>0**.
Sprawdzany jest każdy operand: dwa ujemne stężenia nie mogą dać pozornie
poprawnego dodatniego wyniku. Jawne nierówności w raporcie nie są
zamieniane na dokładną wartość ani na zero; kalkulator nie zachęca do
usunięcia operatora w celu wykonania punktowego obliczenia.

Oryginalne operandy i końcowy wynik muszą mieć skończoną reprezentację
liczbową. Dokładne ułamki zachowują znaczenie pośrednich konwersji.
Dodatni underflow lub overflow kończą się błędem, bez pozornego zera,
`Infinity` albo zapisu `null` zamiast wartości. W nowej ścieżce KM/Cr nie
stosuje się dawnych stałych limitów 200 mg/dL kwasu moczowego i 500 mg/dL
kreatyniny jako progów fizjologicznych.

Dokładne zero pozostaje dostępne liczbowo i neutralne, z uwagą o raporcie
i oznaczalności, bez zielonego werdyktu lub automatycznej kategorii niskiej.
Mały dodatni wynik nie staje się zerem w karcie, Notatce ani badaniu.
Ocena korzysta z dokładnej wartości przed skróceniem prezentacji.
Zwykłe wartości są pokazywane do trzech miejsc po przecinku, a bardzo małe
lub duże w zapisie naukowym. Znak **≈** pojawia się wtedy, gdy pokazana
liczba różni się od dokładnego ułamka, również gdy zaokrąglenie trafia
dokładnie na granicę normy. Pełny zapis lub dokładny ułamek pozostaje
w Szczegółach i utrwalonych danych.

Jedna karta B łączy liczbę pacjenta i **„Normę dla wieku · Newcastle NHS”**
w tej samej jednostce. Liczby normy są neutralne, odchylenia bursztynowe;
obie granice pasma są podpisane. Brak oceny nie jest wynikiem prawidłowym.
Jednostki pacjenta i normy mają wspólny poziom, również przy długich
liczbach i zawiniętych podpisach. Stała geometria, pola ≥16 px/48 px na
telefonie i odstęp pod przyciskiem czyszczenia ≥20 px obowiązują we
wszystkich trybach i stanach. Tabela wieku i źródła pozostają w zwiniętych
**Szczegółach i źródłach**.

## Zastosowania i ograniczenia interpretacji

[Mayo RURC1](https://www.mayocliniclabs.com/test-catalog/Overview/621395)
opisuje użycie KM/Cr m.in. w podejrzeniu ostrej nefropatii moczanowej.
Nie dodaje się więc warunku „bez AKI” ani potwierdzania stabilności
czynności nerek. Standaryzacja IFCC cystatyny C nie dotyczy tego wzoru.
Warunkowego progu `>1 mg/mg` nie używa się jako uniwersalnego alertu dla
każdego wieku; małe dzieci mogą fizjologicznie mieć większe stosunki.
Nie uzupełnia się profilem Mayo lub jego tabelą pediatryczną norm Newcastle.

KM/Cr nie jest stężeniem kwasu moczowego we krwi, miarą dawki leczenia ani
samodzielnym rozpoznaniem. Dieta, leki i obrót puryn wpływają na wydalanie;
kreatynina stanowi mianownik stosunku. Kontekst pH i dobowego wydalania
w ocenie kamicy opisują
[EAU Urolithiasis, Metabolic Evaluation and Recurrence Prevention](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention).
Te uwagi należą do Szczegółów, nie do nowej ankiety lub algorytmu leczenia.

## Jeden zapis i zgodność historii

Zachowany identyfikator to **`KM_Cr`**, klucz badania **`clcr:KM_Cr`**.
Nowy wynik utrwala migawka **`clcr-urate-creatinine` v1** /
**`urateCreatinineSnapshot`**. Przechowuje surowe stężenia lub gotowy stosunek,
jednostki, dokładną wartość, materiał i jego znane fakty, wiek oraz jego
dokładność, użyte źródło/politykę/populację, granice i inkluzywność,
prezentację i ocenę. Badania, Notatki, raport, historia i edycja przedstawiają
ten sam kanoniczny pomiar. Brak oceny ma `outOfRange:null`.

Odczyt nie przelicza historii nowym profilem lub kontekstem aktualnie
wybranego pacjenta. Dawne KM/Cr zachowują zapisaną jednostkę **mg/mg**,
etykietę DZM, materiał i ocenę; brak dawnych danych nie zmienia się
w potwierdzenie punktowej próbki. Dopiero świadoma edycja może przejść
na nowy model: dawne `U_UA` i `Ucr` zachowują znaczenie **mg/dL**, a brak
ustalonego materiału staje się **„Typ próbki nieznany”**, bez normy
punktowej. Sam nowy domyślny wybór nie dopisuje tego faktu historii.
Edycja i usunięcie dotyczą tego samego ID. Zapis wymaga wybranej,
wcześniej zapisanej karty pacjenta.

## Wpływ względem poprzedniej ścieżki

Dotychczasowy iloraz dwóch stężeń mg/dL był arytmetycznie poprawny, lecz
nie miał norm KM/Cr i zawsze przypisywał zapisowi etykietę DZM. Audyt
potwierdził odrzucanie zera przez sprawdzanie prawdziwości wartości,
przyjmowanie ujemnych operandów w edytorze/payloadzie, pokazywanie
dodatniego 0,0004 jako 0,000, tekstowe `labResult.value=0` przy
`valueNum=0.004` oraz dodatni underflow do zera. Formularz i edytor
różniły się też stosowaniem stałych maksymalnych stężeń.

Nowa ścieżka ujednolica te reguły, dodaje jawne jednostki i materiał,
umożliwia wpisanie gotowego stosunku oraz orientacyjne porównanie wieku.
Nie zmienia znaczenia zapisanych wcześniej pomiarów przy ich odczycie.

## Kontrakt regresji rzeczywistych funkcji

Poniższe przypadki określają wymagane zachowanie produkcyjnego silnika,
walidatorów zapisu i rendererów; nie stanowią deklaracji wyniku testów.

| Wejście | Oczekiwany wynik |
| --- | --- |
| 40 lat, próbka jednorazowa, UA 100 i Cr 100 mg/dL | Dokładne 11312/16811 mmol/mmol, czyli ≈0,6728927487954316; karta ≈0,673, powyżej 0,11–0,53 |
| 8 lat, te same stężenia | Ta sama liczba, w zakresie 0,39–0,85 |
| Gotowe 1 mg/mg lub 1000 mg/g | Ten sam stosunek co dla 100/100 mg/dL |
| 40 lat, gotowe 0,11 albo 0,53 mmol/mmol | Obie granice włączone, w zakresie |
| 0,5300000000000000000001 mmol/mmol | Powyżej normy, mimo skrótu ≈0,53 |
| 0,1099999999999999999999 mmol/mmol | Poniżej normy, mimo skrótu ≈0,11 |
| Dokładnie 2 lata, gotowe 0,57 mmol/mmol | W zakresie 0,57–1,35 według jawnej mapy wieku |
| Brak wieku, DZM lub nieznany historyczny materiał | Poprawna liczba bez zastępczej normy punktowej |
| UA 0 / Cr 100 mg/dL | Dokładne 0, neutralna uwaga, wynik dostępny |
| UA 0,04 / Cr 100 mg/dL | Dodatnie 0,0002691570995… mmol/mmol, nigdy 0 |
| Ujemny UA, ujemny Cr, dwa ujemne stężenia lub Cr 0 | Błąd i brak zapisu |
| Dodatni underflow/overflow albo nierówność zamiast dokładnego stężenia | Brak pozornego dokładnego punktowego wyniku |
| Zmiana wieku, źródła lub pacjenta po zapisie | Odczyt zachowuje dawną wartość, jednostkę, materiał i ocenę |

Regresje obejmują pięć grup wieku i ich granice, wszystkie jednostki,
iniekcję innej polityki, dokładne porównanie, edycję i sanitizację,
jedną kanoniczną projekcję, zgodność legacy, sesję/zmianę pacjenta,
desktop/390/320 px oraz rzeczywistą instalację i aktualizację PWA z zimnym
startem przy wyłączonym serwerze. Końcowe wyniki wykonanych testów,
bieżący commit i PR podaje opis PR. Ponowny przegląd jest wymagany po
zmianie źródła lub przed rozszerzeniem profilu na inny materiał/populację.
