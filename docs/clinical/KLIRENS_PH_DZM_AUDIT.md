# pH dobowej zbiórki moczu — audyt 6 listopada 2026

Zakres: `pH24` na podstronie Klirens. Właściciel zaakceptował
[makietę przed/po na desktopie i telefonie](https://vilda-ph-dzm-20261106.maciej-flader.chatgpt.site)
oraz polecił jej implementację wraz z naprawą potwierdzonych niespójności
(„ok, koduj to”). Baza: `83fa1193a8aa29a9f107067286f4a662e3b14f61`.
To odrębny etap od wcześniejszego audytu `pH_spot`; obie pozycje zachowują
własny materiał, źródło zakresu i historię.

## Wpływ kliniczny

Wynik jest **odczytem zmierzonego pH z raportu DZM**, a nie nowym równaniem.
Nie zmienia się wpisanej liczby, nie mnoży jej przez objętość lub `24/czas`
i nie oblicza pH DZM jako średniej arytmetycznej wyników punktowych.
Skala pH jest logarytmiczna; próbka jednorazowa i wymieszana DZM nie są
zamiennymi materiałami.

Zmianą kliniczną jest dodanie jawnego ogólnego zakresu **Mayo UPH24:
4,5–8,0 włącznie**, oznaczonego **„Norma ogólna”**, oraz związanego z nim
koloru. Nie jest to wyłącznie zmiana wyglądu. Zastępuje dawną warunkową
automatyczną interpretację kamicową i osobny „Profil pH” jedną kartą wyniku
z krótkim komentarzem; progi pomocnicze i ograniczenia pozostają w Szczegółach.
Główna karta nie rozpoznaje RTA lub zakażenia i nie ocenia skuteczności leczenia.

Wyniki **<4,5** i **>8,0** są bursztynowe. Granice 4,5 i 8,0 należą do
zakresu. Liczby normy zachowują neutralny kolor. Nie wprowadzono nowego
czerwonego progu pilności. Kolor opisuje wyłącznie porównanie z przyjętym
zakresem, nie całościową prawidłowość stanu pacjenta.

Przykładowo **pH 5,2 mieści się w zakresie ogólnym**, a kwaśny odczyn nadal
sprzyja krystalizacji kwasu moczowego. Komentarz nie nadaje drugiej,
sprzecznej kategorii „poza normą” tej samej liczbie. Wynik mieszczący się
w zakresie nie wyklucza kamicy, zakażenia lub zaburzeń zakwaszania moczu.

## Jedno wymagane pole

Wymagane jest wyłącznie **pH z raportu DZM**. Nie ma jednostki fizycznej
lub selektora jednostek. Do samego odczytu i ogólnego porównania nie są
potrzebne wiek, płeć, masa, wzrost, kreatynina, objętość, ręczne wpisanie
czasu zbiórki, potwierdzenie stabilności czynności nerek, AKI, IFCC ani
dodatkowa ankieta o kamicę lub leczenie.

Świeży formularz dotyczy zbiórki **24-godzinnej**, zgodnie z nazwą DZM
i wcześniejszą decyzją właściciela. To opisane założenie użytkowe, a nie
potwierdzenie, jak pobrano próbkę. Znany inny czas, problem zbiórki,
niezgodny materiał lub konserwant zachowują znaczenie. Nieznane metadane
dawnego zapisu nie stają się po odczycie potwierdzonym protokołem 24 h.

Znana próbka zakwaszona lub alkalizowana, niezgodny materiał albo inny
czas zbiórki pozwalają zachować jasno opisany **odczyt z raportu bez
porównania z normą DZM**. Nie tworzy to dodatkowego obowiązkowego pytania.
Informacje z przypadkowej próbki moczu nie są automatycznie faktami
dotyczącymi DZM. Znane zakażenie pozostaje informacją kliniczną;
komentarz nie może wtedy twierdzić, że pH w zakresie je wyklucza.

## Źródło zakresu i pokrycie populacji

Aktywnym odniesieniem jest **Mayo Clinic Laboratories, UPH24 — pH, 24 Hour,
Urine**, właściwe dla DZM. Nie jest nim `PHU_`, czyli osobny katalog
przypadkowej próbki używany przez `pH_spot`. Metoda opisana w źródle to
pH-metr; aplikacja nie dopisuje jej jako ustalonej metody próbki pacjenta
i nie twierdzi, że jego badanie wykonano w Mayo.

| Populacja | Dostępne odniesienie i ograniczenia |
|---|---|
| Wiek nieznany | Ogólny przedział 4,5–8,0; brak obowiązkowego pytania o wiek. |
| Wcześniaki, noworodki, niemowlęta | Katalog pediatryczny podaje ten sam przedział, ale nie przedstawia osobnej walidacji wcześniaczej ani norm według dnia życia. Nie opisuje się go jako indywidualnej normy dla tego wieku. |
| Dzieci przed pokwitaniem i młodzież | Ten sam przedział katalogowy, bez podziału według wieku, płci lub pokwitania. |
| Dorośli i osoby starsze, obie płcie | Ten sam ogólny przedział, bez osobnych progów geriatrycznych lub zależnych od płci. |

To jawnie wybrane odniesienie laboratoryjne, a nie publikacyjna norma
zależna od wieku. Zakres właściwego laboratorium i rzeczywisty kontekst
pozostają istotne. Normy są wersjonowanymi danymi w
`clcr_ph_dzm_reference_data.js`: polityka **`PH_DZM_MAYO_UPH24_2026_11`
v1**, profil **`MAYO_UPH24`**, przekazywane do
`VildaClcrPhDzm.evaluate(input, policy)`. Silnik nie zaszywa liczb normy
ani nie dobiera źródła według korzystniejszej kategorii.

## Zakres ogólny, progi w kamicy i cele terapii

Te trzy rodzaje odniesienia mają różne znaczenie:

- **4,5–8,0** jest aktywnym ogólnym przedziałem katalogowym UPH24.
- EAU opisuje **pH DZM <5,5** jako nadmiernie kwaśny mocz w ocenie
  metabolicznej kamicy. Tabela progów dotyczy dorosłych; nie staje się
  pediatryczną normą zależną od wieku ani nową granicą głównego koloru.
- **pH DZM >6,2** samo nie rozpoznaje kwasicy cewkowej. Opisany wzorzec
  przesiewowy wymaga również pH **>5,8** w drugiej porannej próbce na czczo,
  wykluczenia zakażenia i kontekstu klinicznego. Utrzymujące się wysokie
  pH może wskazywać na potrzebę oceny zakażenia, ale pojedynczy odczyt nie
  jest jego rozpoznaniem.
- Cele alkalizacji zależą od choroby i zaleceń. Nie są normą zdrowej
  populacji, nie zmieniają automatycznie oceny pH DZM i nie uzasadniają
  dostosowania dawki na podstawie jednego wpisu.

EAU zaleca podczas alkalizacji w kamicy moczanowej lub cystynurii
pomiar **świeżo oddanego moczu o różnych porach dnia**. Jedno pH
wymieszanej DZM nie pokazuje wahań dobowych i nie potwierdza samodzielnie
skuteczności terapii. W Szczegółach można przejść do odrębnej oceny
`pH_spot`; nie łączy się obu serii historii ani nie tworzy z nich średniej.

Pediatryczne EAU opisuje osobne cele dla rozpoznanej kamicy moczanowej
i cystynurii; nie są one nowymi normami pH DZM według wieku. Nie łączy się
różnych celów EAU i AUA w jeden ukryty profil. Ten moduł nie wyznacza dawki.

## Pobranie i przechowywanie próbki

pH należy oznaczyć przed zakwaszeniem lub alkalizacją oddzielnych porcji
moczu przeznaczonych do innych badań. Konsensus Williams i wsp. zaleca
pomiar pH-metrem po otrzymaniu próbki w laboratorium. Odpowiednie
chłodzenie lub dozwolony środek konserwujący ograniczają zmiany próbki;
nie każdy konserwant uniemożliwia pomiar.

**Kwas borowy uniemożliwia prawidłowe oznaczenie pH**; dodanie kwasu lub
zasady zmienia odczyn. Wiadomości o tak przygotowanej próbce nie wolno
wyciszyć przez ogólne założenie poprawnej DZM. Niewłaściwy konserwant
wyłącza fizjologiczne porównanie, a nie jest dowodem skrajnego pH organizmu.

Mayo odrzuca w swoim protokole próbki z pH >8, wskazując możliwe
zanieczyszczenie bakteryjne. Aplikacja odczytuje raport i nie zna protokołu
laboratorium konkretnego pacjenta. Dlatego wysoka liczba daje zalecenie
weryfikacji wyniku i warunków zbiórki; nie jest automatycznym rozpoznaniem
zakażenia lub zanieczyszczenia.

## Walidacja, prezentacja i historia

Jedna walidacja w formularzu, gotowości, zapisie i edytorze przyjmuje
techniczną skalę **0–14 włącznie**. To nie jest fizjologiczny zakres moczu.
Skrajna zaakceptowana liczba otrzymuje porównanie poza normą oraz
komunikat o potrzebie weryfikacji. Wpisy poza skalą nie są po cichu
obcinane do najbliższej granicy.

- Puste pole nie jest zerem. Kropka i przecinek dziesiętny oznaczają tę
  samą liczbę; zapis nieliczbowy, nieskończony lub poza skalą jest błędem.
- Wartość do porównania, `rawValue` i zapisywana liczba pozostają zgodne.
  Formatowanie nie może zmienić strony granicy: 4,4999 to nadal <4,5,
  a 8,0001 to nadal >8,0. Nie dopisuje się pozornej dokładności przez dwa
  stałe miejsca dziesiętne. Niezapisywalna bezstratnie precyzja wymaga
  poprawienia wpisu zamiast niejawnej zmiany cyfr.
- Jedna karta B łączy liczbę, podpisany przedział, wyraźne granice skali
  i komentarz. Znacznik poza rysowanym zakresem osi nie udaje punktu na
  jej skrajnym oznaczonym ticku. Formularz i wynik zachowują stałą
  szerokość; na telefonie wejście ma ≥16 px czcionki i ≥48 px wysokości,
  a odstęp przycisku czyszczenia od wyniku wynosi ≥20 px.
- `VildaClcrPhDzm` odpowiada za liczbę i ocenę, `ClcrPhDzmUi` za
  prezentację, a `ClcrPhDzmPersistence` za spójny zapis i odczyt.
- Nowy `phDzmSnapshot`, schemat **`clcr-ph-dzm` v1**, zamraża wejście,
  dokładną liczbę, prezentację, materiał, fakty zbiórki, zakres, źródło,
  populację, wersję polityki i ocenę. Badania, Notatki, wykresy i raport
  mają odczytywać tę samą ocenę z dnia zapisu.
- READ nie wywołuje bieżącego silnika, nie dobiera dzisiejszej normy ani
  danych obecnie wybranego pacjenta. Stary zapis bez wiarygodnej oceny
  pozostaje nieoceniony (`outOfRange:null`); dawne techniczne `false`
  wynikające jedynie z braku klasy CSS nie potwierdza porównania z normą.
  Świadoma edycja stosuje aktualne reguły, zachowując znaczenie znanych
  ograniczeń próbki. Nie migruje się realnych danych pacjentów.

## Potwierdzone problemy sprzed zmiany

1. Formularz miał maksimum pH 9, a edytor dopuszczał wartości do 14;
   zero i brak danych były traktowane niespójnie.
2. Ponowne obliczenie tych samych danych w edytorze mogło zgubić kontekst
   wcześniejszego przesiewowego komentarza RTA i zmienić interpretację.
   Nowa główna karta nie nadaje automatycznego rozpoznania RTA; jej
   zakres i komentarz muszą być identyczne w formularzu i edycji.
3. `valueNum` mógł otrzymać liczbę po formatowaniu, podczas gdy osobne
   `rawValue` zachowywało dokładniejszy odczyt.
4. Neutralny wynik bez normy mógł zapisać się jako `outOfRange:false`
   zamiast braku oceny.
5. Widok powielał „Dodatkowe dane i kontekst”, osobny „Profil pH” oraz
   komunikaty o wstrzymanej interpretacji, mimo dostępnej liczby.

## Syntetyczne kontrakty do weryfikacji produkcyjnego kodu

Poniższa tabela określa oczekiwane zachowanie, nie stan wykonania testów.
Kontrole uruchomione dla końcowego commitu oraz ich wyniki raportuje PR.

| Wejście | Oczekiwany wynik |
|---|---|
| Brak wieku, masy, wzrostu i objętości; pH `5,2` | Liczba 5,2; zakres 4,5–8,0; `within`; komentarz o krystalizacji kwasu moczowego; jedno wymagane pole. |
| Dziecko 10 lat; pH `5.2` | Ta sama liczba i ogólny zakres; bez etykiety „Norma dla wieku”. |
| pH `4,5` albo `8` | Granica włączona, ocena `within`. |
| pH `4,4999` | Dokładnie 4,4999 w liczbie i zapisie; ocena `low`, nie zaokrąglone 4,5. |
| pH `8,0001` | Dokładnie 8,0001; ocena `high`, nie zaokrąglone 8,0. |
| pH `10` | Poprawna liczba techniczna; powyżej normy; komunikat weryfikacji i jawny znacznik poza osią. Nie blokuje go dawne maksimum 9. |
| pH `0` lub `14` | Liczba technicznie dopuszczona, poza normą; potrzeba weryfikacji. |
| Pusto, `-1`, `15`, `abc` | Brak poprawnego wyniku do zapisu; pusty wpis nie jest zerem. |
| pH `5,2`, znany konserwant zakwaszający | Odczyt 5,2 bez normy i fizjologicznej oceny, z powodem ograniczenia. |
| pH `5,2`, znane 12 h | Odczyt 5,2 bez normy DZM, bez przeliczenia do 10,4 lub 2,6. |
| Znane zakażenie; zmiana pH 7,5 na 8,2 | Uwaga o zakażeniu pozostaje; nowa liczba nie otrzymuje sprzecznego stwierdzenia, że mieści się w zakresie. |
| Odczyt zapisanego 4,4999 po zmianie aktywnego profilu | Zachowana liczba, dawne źródło i dawna ocena; brak ponownego liczenia. |

## Znaczenie aktualizacji wcześniejszych regresji

Zmiana oczekiwań dawnych testów wynika z zaakceptowanej zmiany klinicznej
i uproszczenia formularza, a nie z wyłączenia niewygodnych asercji:

- `klirens-ph-audit.spec.mjs` nadal sprawdza niezależność pH próbki
  jednorazowej i DZM. DZM ma teraz własny profil UPH24 i przyjmuje
  technicznie poprawne pH 10; nie oczekuje się już braku normy ani
  dawnego maksimum 9. Oba pola i oba źródła pozostają odrębne.
- `klirens-shared-dzm-duration.spec.mjs` zachowuje przypadki domyślnego,
  pustego, jawnego, błędnego i historycznie nieznanego czasu dla pH DZM.
  W tej formule czas jest metadanymi próbki, bez obowiązkowej kontrolki.
  Znane 12 h, błędny czas i brak czasu historycznego wyłączają porównanie
  DZM, ale nie zmieniają odczytanego pH. Wyczyszczenie samego pomiaru
  nie może zamienić znanych 12 h w potwierdzoną pełną dobę. Pozostałe
  obliczenia wydalania zachowują odrębne testy skalowania 24/czas.
- `klirens-stage2-stage3.spec.mjs` zachowuje precyzję liczb, granice
  cystyny i pozostałe oznaczenia panelu. Zamiast automatycznej kategorii
  hiperkwasowego moczu lub przesiewowego wzorca RTA pH DZM otrzymuje
  źródłowy zakres ogólny i krótki komentarz. Warunki przesiewu RTA
  pozostają edukacją w Szczegółach. Błędne pH próbki jednorazowej nie
  zmienia niezależnego pH DZM ani nie tworzy drugiego rozpoznania.

Nowe `klirens-ph-dzm.spec.mjs` wywołuje rzeczywiste strony, renderer,
zapis i czytniki: obejmuje 320/390/1440 px, jedno pole, granice 4,5/8,0,
dokładne 4,4999/8,0001, brak wieku, znane niezgodności próbki, rozdział
od pH punktowego, wybór w wyszukiwarce, zamrożony odczyt oraz edycję
i usunięcie wskazanego pomiaru. Stan wykonania podaje raport PR.

## Źródła, wersje i granice odczytu

Odczyt źródeł w audycie: **06.11.2026**. Katalogi bez numeru wydania
identyfikuje data dostępu. Pełnych publikacji nie kopiowano do repozytorium.

1. **Mayo Clinic Laboratories, UPH24 — pH, 24 Hour, Urine.**
   [Katalog DZM](https://www.mayocliniclabs.com/test-catalog/overview/606521).
   Odczytano sekcje Reference Values, Specimen Required, Urine Preservative
   Collection Options, Clinical Information i metodę. Zakres 4,5–8,0,
   pH-metr, wymagania próbki i ograniczenia konserwacji. Wymagana przez
   laboratorium objętość DZM jest informacją obsługi próbki, a nie członem
   obliczenia pH w aplikacji.
2. **Mayo Clinic Laboratories, Pediatric Catalog, UPH24.**
   [Pełny katalog pediatryczny](https://pediatric.testcatalog.org/show/UPH24).
   Ten sam przedział 4,5–8,0 bez grup wieku i płci; nie stanowi osobnej
   publikacyjnej walidacji wcześniaczej lub neonatalnej.
3. **EAU Guidelines on Urolithiasis 2026.**
   [Metabolic Evaluation and Recurrence Prevention](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention),
   §4.1.2, tabela 4.2 oraz części o kamicy moczanowej, fosforanowo-wapniowej
   i cystynurii. Pobranie, progi pomocnicze, warunki podejrzenia RTA
   i kontrola alkalizacji świeżego moczu. [Chemolysis, §3.4.4](https://uroweb.org/guidelines/urolithiasis/chapter/guidelines)
   opisuje osobny cel leczenia, a nie normę pH DZM.
4. **EAU Guidelines on Paediatric Urology 2026.**
   [Urinary Stone Disease](https://uroweb.org/guidelines/paediatric-urology/chapter/urinary-stone-disease),
   §§18.2.1–18.2.3. Materiał świeży i chorobowo swoiste cele pediatryczne;
   brak tabeli zdrowych norm pH DZM według wieku.
5. **Williams i wsp. Urine and stone analysis for the investigation of
   the renal stone former: a consensus conference. Urolithiasis
   2021;49:1–16.** [DOI 10.1007/s00240-020-01217-3](https://doi.org/10.1007/s00240-020-01217-3),
   [pełny tekst wydawcy](https://link.springer.com/article/10.1007/s00240-020-01217-3),
   pytania Q5–Q6 i Q10. Odczytano pełny HTML wydawcy; odrębna próba PMC
   zwróciła CAPTCHA. Przygotowanie i pomiar pH przed modyfikacją porcji
   moczu, ograniczenia zastępowania DZM próbką punktową.

Nowe AUA 2026 podaje częściowo odmienne cele leczenia w zindeksowanym
tekście pierwotnego czasopisma; pełny tekst zwrócił 403. Nie traktowano
tego odczytu jako pełnej weryfikacji publikacji ani podstawy nowego
profilu. Dla omawianych zasad wystarczają jawnie nazwane, odczytane źródła
EAU, Mayo i konsensus Williams i wsp.
