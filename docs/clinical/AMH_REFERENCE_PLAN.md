# AMH i inhibina B — odniesienia liczbowe, plan aktualizowany 14.10.2026

Plan dotyczy dostępności źródłowych median/średnich i wykorzystania danych
pacjenta. Nie utożsamia płynnej krzywej edukacyjnej z medianą, a mediany
z granicami referencyjnymi. Obowiązują [zasady krzywych](HORMONE_CURVE_AGENT_GUIDE.md)
i [zasady interpretacji badań](LAB_INTERPRETATION_AGENT_GUIDE.md).

## 1. Podstawa AMH — zakończone, PR #661

- Zastąpienie nieaktualnej tabeli laboratoryjnej pełnym, sprawdzonym katalogiem
  Mayo AMH1/608824: 16 przedziałów wieku/płci, Roche Elecsys AMH, surowica.
  Szczegóły, źródła, populacja i ograniczenia: [AMH.md](AMH.md).
- Usunięcie ogólnego zakresu dorosłej kobiety przy brakujących danych,
  nieuzasadnionej blokady po 45. roku życia i progów PCOS/IVF z tej tabeli.
- Zachowanie jednostronnych granic jako `<`, bez fikcyjnego dolnego zera.
  Znane wcześniactwo w 1. roku życia wstrzymuje porównanie katalogowe;
  jest to ostrożnościowa polityka aplikacji, nie kryterium opublikowane przez Mayo.
- Odczyt istniejącego dokładniejszego wieku minipuberty z karty także dla AMH.
  Bez nowych pól, zmian źródeł median ani przebiegu krzywych.
- Krótki powód braku odniesienia wykresu AMH u niemowlęcia, gdy nie można
  zakwalifikować go do modelu donoszonej populacji.
- Historia: zachowanie surowej wartości/jednostki i jawnego zapisanego
  `lab.norm`; bez ponownego klasyfikowania dawnego AMH nowymi zakresami.
  Nie dodajemy w tym kroku nowego formatu snapshotów AMH.
- Regresje rzeczywistych funkcji i formularza, desktop/mobile, aktualizacja
  PWA i restart offline. Draft PR do `audyt`; wszystkie kontrole GitHub
  muszą zakończyć się dla aktualnego SHA. Scalenie należy do właściciela.

## 2. Uzupełnienie median z już zweryfikowanych źródeł

Przed każdym rozszerzeniem sprawdzić pełny przedział wieku, metodę,
materiał, populację, statystykę i pierwszeństwo nakładających się źródeł.
Nie łączyć surowicy z osoczem ani średniej geometrycznej z medianą.

1. **Zakończone, PR #665 — męskie AMH:** brakujące odcinki grup Jopling 2018
   w wieku 12–<13 i 15–<18 lat oraz Benderradji w wieku 20–<30 lat,
   z ograniczeniami wyselekcjonowanej populacji normozoospermicznych
   partnerów. To trzy mediany całych grup 12–14,9, 15–18,9 i 20–39,
   bez interpolacji, zmiany krzywych lub norm; luka 18–<20 pozostaje.
   Pełne źródła i polityka: [kontrakt punktu](hormone-lifespan/PATIENT_POINT.md#męskie-amh--uzupełnienie-median-grupowych-13-października-2026).
2. **Zakończone, PR #670 — żeńskie AMH:** pięć median grup surowicy FDA
   K170524/Access 2 w zwykłych widokach. Jawna konwencja ukończonych lat:
   `[18,26)`, `[26,31)`, `[31,36)`, `[36,41)`, `[41,46)`; cały możliwy
   wiek musi mieścić się w jednej grupie. Bez interpolacji, aktywacji
   tabeli norm FDA ani zmiany istniejącej ilustracji opartej na osoczu.
   Nieznana metoda/materiał/cykl nie wymaga nowych pól; znana niezgodność,
   ciąża lub stan po menopauzie blokują to nowe odniesienie. Zachowane
   dotychczasowe blokady, w tym GnRHa. Szczegóły i przypadek F28/1 ng/mL:
   [kontrakt punktu](hormone-lifespan/PATIENT_POINT.md#żeńskie-amh--mediany-dorosłych-fda-13-października-2026).
3. **Zakończone, PR #672 — inhibina B obu płci:** ponowna macierz dostępności
   oraz rozszerzenie zwykłego żeńskiego profilu Borelli-Kjær do **5,6–47 lat
   włącznie**. Zachowane wszystkie 24 węzły i PCHIP, bez sztucznej granicy
   przy 20 latach. To przybliżona mediana wieku; cyklu nie standaryzowano,
   a danych antykoncepcji brakowało u większości kobiet. Znana ciąża/menopauza wyłącza ten zwykły profil
   jako konserwatywna polityka aplikacji, bez nowego pola i bez zmiany
   porównania płci 8–20, krzywych lub norm. Szczegóły:
   [kontrakt punktu](hormone-lifespan/PATIENT_POINT.md#żeńska-inhibina-b--rozszerzenie-odniesienia-do-47-lat-14-października-2026).
   Crofton nie jest aktywowany. Tabela grupy 0–6 lat obejmuje N=105,
   lecz szerokie łączenie wieku, 35% wyników pod LOD, osocze i historyczna
   metoda wymagają osobnej decyzji; nie jest to mediana dokładnego wieku
   ani model minipuberty. W tej partii luki >1–<5,6 oraz >47 lat pozostały jawne.
   Męskie źródła pozostają bez zmian: Busch 7 dni–<1 roku, Kelsey
   1–<6,1 i Borelli 6,1–80 lat. Osobne średnie grup Senior do 101 lat
   nie wypełniają luki zwykłego modelu po 80. roku. Mediany wcześniaków
   Kuiri w dwóch wizytach pozostają podsumowaniami grup, bez dokładnego
   punktu na krzywej wieku. Poniższa kolejna partia wykorzystuje Zhou
   dla młodszych dziewczynek; nie aktywuje Crofton.
4. **Zakończone, PR #673 — inhibina B dziewczynek >1–<5,6 lat:** dwie stałe
   mediany pełnych grup Zhou 2025: 1–5 lat, N=60, **33 pg/mL** oraz
   5–10 lat, N=77, **27 pg/mL**. Surowica, Kangran CLIA na KAESER 1000,
   przekrojowa kohorta szpitalna z Wuhan. Zwykły wykres stosuje je tylko
   w `(1,5)` i `[5,5.6)`; granica 5 jest jawną konwencją aplikacji,
   nie opisaną regułą autorów. Dokładnie 1 zachowuje Ljubicic, od 5,6
   Borelli. Cały możliwy wiek musi pasować do jednej grupy, bez interpolacji.
   Nieznana metoda/materiał pozwala na orientacyjne odniesienie;
   znana niezgodność je wyklucza. Bez harmonizacji z Gen II, nowych norm,
   krzywych, pól, historii, profili męskich lub porównań płci. Szczegóły:
   [kontrakt punktu](hormone-lifespan/PATIENT_POINT.md#żeńska-inhibina-b--mediany-grup-dziecięcych-zhou-14-października-2026).
   Pozostają braki przed pierwszym żeńskim węzłem 0,02 roku, po 47 latach
   i dla wieku przecinającego granice źródeł. Dane wcześniacze i męski
   pierwszy tydzień wymagają osobnych materiałów lub decyzji.
5. **Bieżąca partia — zapis odniesienia AMH w wizycie i historii:**
   istniejące „Przypnij do wizyty” utrwala źródłową wartość odniesienia,
   rodzaj statystyki, grupę, użyty wiek i kontekst, jednostki, źródło,
   wersje oraz ograniczenia albo powód braku odniesienia. Opcjonalne
   `lab.hormoneReference` jest odrębne od normy i oceny laboratoryjnej.
   Odczyt korzysta wyłącznie z zapisu, bez dzisiejszego modelu lub
   pacjenta. Edycja wyniku, jednostki lub daty unieważnia odniesienie;
   komentarz je zachowuje. Starsze wpisy bez tego pola nie dostają
   automatycznie nowej mediany. Bez nowych pól, norm i zmian krzywych.
   Kontrakt: [utrwalone odniesienie AMH](hormone-lifespan/PATIENT_POINT.md#utrwalone-odniesienie-amh--14-października-2026).
   Weryfikacja zapisu, ponownego odczytu, edycji, importu i działania
   offline oraz kontrole GitHub pozostają warunkiem zakończenia partii.

## 3. Nowe materiały Xu 2026 — zapisane, profil jeszcze nieaktywny

Właściciel dostarczył pełny artykuł i suplement XLSX:
[DOI 10.1097/CM9.0000000000004161](https://doi.org/10.1097/CM9.0000000000004161).
Przegląd i liczby: [xu2026-amh-source-review.json](hormone-lifespan/evidence/xu2026-amh-source-review.json).

- Referencyjna kohorta to 10 543 kobiety **przed menopauzą, 35–55 lat**,
  metoda HS-AMH Kangrun, surowica, ng/mL. Osobna grupa 422 kobiet po
  menopauzie służy analizie diagnostycznej, nie dopasowaniu tego zakresu.
- Suplement zawiera tabele zbiorcze, nie indywidualne pomiary. Punkty
  P50 dla wieku 35/40/45/50/55 nie są stałymi medianami pięcioletnich grup.
- Przed aktywacją trzeba jawnie ustalić sposób odniesienia pomiędzy
  punktami, postępowanie poniżej LOD i wyjaśnić rozbieżności części tabel
  pomocniczych. Nie dopisywać pozornej rocznej dokładności.
- Nie przenosić wyników na inne metody, wszystkie kobiety po 45. roku
  życia, potwierdzoną menopauzę ani wiek >55 lat. Nie zastępować nimi
  zakresów Mayo i nie zmieniać automatycznie istniejącej krzywej.

Po każdym kroku aktualizować ten plan i rejestr `ALGORITHMS.md`;
nie oznaczać następnego etapu jako wdrożonego na podstawie samej analizy źródła.

