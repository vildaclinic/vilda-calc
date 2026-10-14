# AMH i inhibina B — odniesienia liczbowe, plan po audycie 13.10.2026

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
2. **Bieżąca partia — żeńskie AMH:** pięć median grup surowicy FDA
   K170524/Access 2 w zwykłych widokach. Jawna konwencja ukończonych lat:
   `[18,26)`, `[26,31)`, `[31,36)`, `[36,41)`, `[41,46)`; cały możliwy
   wiek musi mieścić się w jednej grupie. Bez interpolacji, aktywacji
   tabeli norm FDA ani zmiany istniejącej ilustracji opartej na osoczu.
   Nieznana metoda/materiał/cykl nie wymaga nowych pól; znana niezgodność,
   ciąża lub stan po menopauzie blokują to nowe odniesienie. Zachowane
   dotychczasowe blokady, w tym GnRHa. Szczegóły i przypadek F28/1 ng/mL:
   [kontrakt punktu](hormone-lifespan/PATIENT_POINT.md#żeńskie-amh--mediany-dorosłych-fda-13-października-2026).
3. **Następny krok — inhibina B obu płci:** ponowna macierz dostępności; kobiety >20–47 lat
   w modelu Borelli-Kjær z ograniczeniami cyklu/antykoncepcji. Mała grupa
   Crofton u najmłodszych dziewczynek wymaga osobnej decyzji o przydatności
   przy historycznym oznaczeniu, osoczu i niskich stężeniach.
4. Dopiero potem rozważyć osobny snapshot bieżącego porównania AMH,
   jeżeli ma ono być utrwalane w wizytach i historii. Brak snapshotu nie
   upoważnia do odtwarzania dawnej interpretacji dzisiejszą tabelą.

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

