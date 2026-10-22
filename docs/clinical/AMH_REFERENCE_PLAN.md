# AMH i inhibina B — stan planu na 22.10.2026

Aktualna [macierz pokrycia i luk](hormone-lifespan/REFERENCE_COVERAGE_AUDIT.md)
jest wspólnym zestawieniem dostępności odniesień wszystkich hormonów.
Poniżej zapisano zakończone etapy AMH i inhibiny B oraz ograniczenia
pozostałych prac. Zwykły punkt pacjenta, osobna informacja o źródle,
ilustracja edukacyjna i norma laboratoryjna mają odrębne kontrakty.
Obowiązują [zasady krzywych](HORMONE_CURVE_AGENT_GUIDE.md)
i [zasady interpretacji badań](LAB_INTERPRETATION_AGENT_GUIDE.md).

## 1. Zakończone etapy AMH

- **PR #661 — zakresy laboratoryjne i kontekst wieku:** pełny katalog
  Mayo AMH1/608824, 16 przedziałów wieku/płci, Roche Elecsys AMH,
  surowica. Zachowano jednostronne granice `<`, bez fikcyjnego dolnego
  zera, i odczyt dokładniejszego wieku z formularza. Znane wcześniactwo
  w 1. roku wstrzymuje porównanie katalogowe jako ostrożnościowa polityka
  aplikacji. Szczegóły: [AMH.md](AMH.md).
- **PR #665 — mediany męskich grup:** Jopling w 12–<13 i 15–<18 lat
  oraz Benderradji w 20–<30 lat. To mediany całych grup źródłowych
  12–14,9, 15–18,9 i 20–39, bez interpolacji. Wyselekcjonowana populacja
  normozoospermicznych partnerów ogranicza uogólnienie Benderradji.
  Pozostawioną wtedy lukę 18–<20 uzupełnił później PR #713.
- **PR #670 — żeńskie mediany dorosłych FDA/Access 2:** pięć grup
  surowicy w `[18,26)`, `[26,31)`, `[31,36)`, `[36,41)`, `[41,46)`.
  To jawna konwencja ukończonych lat aplikacji; cały możliwy wiek musi
  pasować do jednej grupy. Bez interpolacji i aktywacji norm FDA.
  Znana niezgodna metoda/materiał, ciąża lub stan po menopauzie wyklucza
  odniesienie; brak danych nie wymaga nowych pytań. Zachowano GnRHa.
- **PR #677 — utrwalone odniesienie AMH:** istniejące „Przypnij do
  wizyty” zapisuje zwykłe odniesienie w opcjonalnym `lab.hormoneReference`,
  odrębnie od normy i oceny laboratoryjnej. Zachowuje statystykę, grupę,
  użyty wiek/kontekst, jednostki, źródło, wersje i ograniczenia albo powód
  braku odniesienia. Odczyt używa zapisu bez przeliczania obecnym modelem;
  zmiana wyniku, jednostki lub daty unieważnia odniesienie, komentarz
  je zachowuje. Starsze wpisy bez migawki nie otrzymują nowej mediany.
- **PR #711 — znana ciąża:** jawny trymestr wyłącza pięć pediatrycznych
  żeńskich profili Jopling AMH. Jest to ostrożnościowa reguła aplikacji,
  nie dopisane kryterium badania. Nieznany kontekst pozostaje nieznany,
  bez dodatkowego pytania; źródłowe mediany nie zmieniają się.
- **PR #713 — męskie AMH 18–<20:** Woloszynek 2015, tabela 2,
  **mediana całej grupy 18–30 lat: 6,3 ng/mL, N=63**
  (44,9678800856531 pmol/L). Zastosowanie wyłącznie w `[18,20)` jest
  polityką aplikacji; nie tworzy mediany podgrupy 18–20 ani dokładnego
  wieku. Surowica, opisany manualny protokół Gen II ELISA, bez kalibracji
  do innych metod. Cały możliwy wiek musi pasować; zachowane bramki
  metody, materiału, terapii i tożsamości pacjenta nie wymagają nowych pól.

Pełne źródła, granice i przypadki syntetyczne:
[kontrakt punktu i migawki](hormone-lifespan/PATIENT_POINT.md).
Zmiany nie utożsamiają mediany grupy z normą ani wysokością poglądowej
krzywej i nie przeliczają dawnych ocen nowymi źródłami.

## 2. Xu 2026 — osobny blok pięciu P50 wdrożony w PR #681

Właściciel dostarczył pełny artykuł i suplement XLSX:
[DOI 10.1097/CM9.0000000000004161](https://doi.org/10.1097/CM9.0000000000004161).
Referencyjna kohorta obejmuje 10 543 kobiety **przed menopauzą, 35–55 lat**;
HS-AMH Kangrun, surowica, ng/mL. Osobna grupa 422 kobiet po menopauzie
służy analizie diagnostycznej, nie temu odniesieniu.

- Blok pokazuje opublikowane pary **wiek 35/40/45/50/55 → P50**.
  Dla wieku pośredniego przedstawia sąsiednie źródłowe wiersze, bez
  obliczania nowej mediany. Nie są to mediany pięcioletnich grup,
  granice normy ani przedział możliwej mediany konkretnej pacjentki.
- **Ciągły model Xu i nowy profil punktu pacjentki pozostają nieaktywne.**
  Blok nie wyznacza percentyla, ilorazu do P50, SDS ani diagnozy;
  nie trafia do `lab.hormoneReference`. Wyjątek `terminal-anchor` dla
  ukończonych 55 lat pokazuje tylko ostatni punkt, z informacją o niepełnym
  pokryciu wieku; nie rozszerza modelu do 56 lat.
- Brakuje pełnych parametrów GAMLSS, jawnej obsługi wartości poniżej
  LOD i oddzielnego LOQ. Literalne `<0.003` nie staje się zerem, LOD/2
  lub dokładnym pomiarem. Rozbieżności nazw Mean/median, etykiet LOD,
  liczebności i χ² są opisane w audycie i pozostają ograniczeniami źródła.
- Nie harmonizujemy Kangrun z Access, Elecsys lub Gen II. Znana
  menopauza, ciąża, leczenie hormonalne lub niezgodna metoda/materiał
  ukrywa blok według polityki aplikacji. Nieznany kontekst nie potwierdza
  kwalifikacji pacjentki. Zakresy Mayo i istniejące krzywe pozostają odrębne.

Aktualny kontrakt: [AMH_XU_2026.md](hormone-lifespan/AMH_XU_2026.md)
i [audyt wdrożenia](hormone-lifespan/evidence/amh-xu-2026-audit.json).
[Wcześniejszy przegląd](hormone-lifespan/evidence/xu2026-amh-source-review.json)
zachowuje historyczny stan decyzji przed wdrożeniem osobnego bloku.

## 3. LiLACS — osobna informacja źródłowa, 22.10.2026

Po audycie pełnego źródła i akceptacji makiety przez właściciela mały
krok obejmuje kartę „AMH — badanie mężczyzn 80–90 lat”. Chong 2013,
tabela 1, publikuje **medianę całej grupy LiLACS NZ: 12,1 pmol/L,
około 1,7 ng/mL, N=257**. Karta opisuje badaną grupę; nie porównuje z nią
wyniku pacjenta, nie tworzy mediany dokładnego wieku, punktu, ilorazu,
RI, SDS, percentyla ani nowej migawki odniesienia.

Wykorzystuje gotowy kontekst tej samej osoby oraz wiek i płeć formularza
głównego, bez dodatkowych pytań. Cały możliwy wiek musi mieścić się
w `[80,90]`: dokładne 90 kwalifikuje, ukończone „90 lat” = `[90,91)`
nie kwalifikuje. To ostrożna polityka aplikacji, nie odzyskana definicja
granic u autorów. Prawidłowy wynik z nierównością może zachować kartę
informacyjną, lecz nie staje się dokładnym punktem. Zmiana osoby, płci,
analitu lub blokada kontekstu usuwa kartę.

Źródło obejmuje surowicę i historyczne oznaczenia AMH. Nie ustalono
przypisania zestawów do LiLACS ani zgodności z metodą próbki pacjenta.
Znana inna metoda lub materiał nie staje się zgodny przez pokazanie
informacji o publikacji. Szczegóły populacji, oznaczeń, cenzurowania
i nierozstrzygniętych liczebności są w rozwijanych ograniczeniach
i [kontrakcie LiLACS](hormone-lifespan/AMH_LILACS_SOURCE.md).

`amhLilacsSourceData` jest odrębnym zestawem danych źródłowych,
poza **85 profilami** zwykłego silnika (`2026-10-22.2`). Geometria,
skale, normy laboratoryjne, dotychczasowe odniesienia i historia pozostają
bez zmian. **Luka zwykłego punktu AMH po 70 latach pozostaje**, także
w 80–90; karta nie wypełnia przedziału >70–<80 ani nie przedłuża Tehrani.

## 4. Zakończone etapy inhibiny B

- **PR #672 — zwykły żeński profil Borelli-Kjær 5,6–47 lat włącznie:**
  zachowane 24 węzły i PCHIP, bez sztucznej granicy przy 20 latach.
  To przybliżona mediana wieku; cyklu nie standaryzowano, a danych
  antykoncepcji brakowało u większości kobiet. Znana ciąża/menopauza
  wyłącza zwykły profil jako polityka aplikacji. Porównanie płci 8–20,
  krzywe i normy zachowują osobne kontrakty.
- **PR #673 — dziewczynki >1–<5,6 lat:** stałe mediany pełnych grup
  Zhou 2025: 1–5 lat, N=60, **33 pg/mL** oraz 5–10 lat, N=77,
  **27 pg/mL**. Surowica, Kangran CLIA/KAESER 1000, kohorta szpitalna
  z Wuhan. Aplikacja stosuje je w `(1,5)` i `[5,5.6)`; granica 5 jest
  jawną konwencją aplikacji. Dokładnie 1 zachowuje Ljubicic, od 5,6
  Borelli. Cały możliwy wiek musi pasować, bez interpolacji między grupami
  i harmonizacji z Gen II. Znana niezgodność metody/materiału blokuje
  porównanie; brak danych nie wymaga nowego formularza.

Męskie źródła: Busch 7 dni–<1 roku, Kelsey 1–<6,1 i Borelli 6,1–80 lat.
Osobne średnie grup Senior do 101 lat nie uzupełniają zwykłego modelu
po 80 latach. Kuiri pozostaje podsumowaniem dwóch wizyt dzieci donoszonych
i wcześniaków. Żeńska grupa wieku Crofton 0–6 lat nie jest aktywowana:
N=105, 35% pod LOD,
osocze i historyczna metoda nie dają mediany dokładnego wieku ani modelu
minipuberty. Szczegóły: [kontrakt punktu](hormone-lifespan/PATIENT_POINT.md).

## 5. Pozostałe prace

Wśród luk **zwykłego punktu AMH** pozostają mężczyźni >70 lat i kobiety
od 46 lat. Nie oznacza to braku całej informacji w aplikacji: FDA daje
mediany grup kobiet 18–<46, Xu osobne punkty P50 wieku 35–55, LiLACS
osobną informację o całej grupie mężczyzn 80–90, a Mayo odrębne zakresy
laboratoryjne. Dla >70–<80 nadal brakuje potwierdzonej gotowej mediany;
mediany dokładnego wieku nie daje też LiLACS. Pozostałe granice wieku,
niepewny wiek i kontekst kwalifikacji opisuje aktualna
[macierz](hormone-lifespan/REFERENCE_COVERAGE_AUDIT.md).

Nowe źródło wymaga sprawdzenia pełnego wieku, metody, materiału, populacji,
statystyki i pierwszeństwa. Nie łączyć surowicy z osoczem ani średniej
geometrycznej z medianą. Nie oznaczać etapu jako wdrożonego na podstawie
samej analizy publikacji. Dalsze zmiany aktualizują ten plan i rejestr
`ALGORITHMS.md`; wymagane kontrole GitHub muszą zakończyć się dla aktualnego
SHA. Zielone testy nie nadają walidacji klinicznej; scalenie należy do właściciela.

