# Karta pacjenta: zakładka „Leczenie” — plan i decyzje (P-KARTA-LECZENIE)

Stan na 2026-11-21 (etap 3). Dokument utrwala ustalenia właściciela i etapy pracy, żeby kolejne PR-y i inne wątki nie odtwarzały
ich z rozmowy. Opis techniczny wdrożonych etapów: `docs/clinical/ALGORITHMS.md`, wpisy „P-KARTA-LECZENIE”; łatki
zminifikowanego `vilda_auth_ui.js`: `docs/ZRODLA_ARTEFAKTOW.md`.

## Po co

Bloki leczenia w Karcie pacjenta (podsumowanie i „Dane analityczne” leczenia hormonem wzrostu; podsumowanie, „Wpisy
leczenia” i „Dane analityczne — otyłość”) stały jeden pod drugim **nad** paskiem zakładek i były widoczne przy każdej
zakładce. U pacjenta leczonego z powodu otyłości lekarz przewijał 1,3–1,9 ekranu komputera (1,9–2,4 ekranu telefonu),
zanim zobaczył pierwszy kafelek „Status”. Te same informacje (lek, dawka, redukcja, ocena wg ChPL) powtarzały się
w kilku miejscach Karty. Inwentarz i pomiary sprzed zmiany: wątek makiet z 2026-11-19 (zrzuty i opis poza repozytorium).

## Decyzje właściciela (2026-11-19)

Spośród wariantów makiety (A — bloki zwinięte nad zakładkami, B — karta leczenia z przełącznikiem, C — pasek nad
zakładkami i zakładka „Leczenie”) właściciel wybrał **hybrydę**: góra Karty jak w wariancie C (pasek leczenia nad
zakładkami + zakładka „Leczenie”), w zakładce karta leczenia z przełącznikiem — dla otyłości „Przegląd | Wpisy |
Analiza”, dla GH „Przegląd | Trend dawki | Analiza”. Makiety (komputer i telefon) zaakceptowane.

- **D1** — krótka ocena na pasku: „⏳ oceń po 12 tyg.”, „✓ kontynuować leczenie”, „✗ wg ChPL odstawić i ponownie ocenić”.
- **D2** — trwające leczenie na górze, zakończone pod nim.
- **D3** — siedem zakładek na telefonie w układzie 2 + 2 + 2 + 1 (ostatnia na całą szerokość — istniejąca reguła).
- **D4** — pasek zakładek nie może skakać przy przełączaniu zakładek; dlatego pasek leczenia stoi stale nad zakładkami
  (nazwa leczenia jest i na pasku, i w karcie w zakładce).
- **D5** — hybryda powstaje w obecnej Karcie (`audyt`) jako jeden moduł; nowa strona główna (karta B1) użyje później
  tych samych kart leczenia w swoim „Monitorowaniu leczenia”.
- Etap 1 zaakceptowany do realizacji („zaczynaj od etapu 1”).

## Etapy

| Etap | Zakres | Stan |
|---|---|---|
| 1 | Zakładka „Leczenie” (druga, tylko przy leczeniu) z dzisiejszymi blokami bez zmian; pasek leczenia nad zakładkami (przycisk otwierający zakładkę, wartości z tych samych danych co bloki, pigułka oceny D1); odnośniki do „Leczenia” (Notatki) | wdrożony w tym PR (SW 1.1.561) |
| 2 | Karta leczenia otyłości w zakładce: przełącznik „Przegląd \| Wpisy \| Analiza”, „Przegląd” z czterema liczbami i oceną w jednej linii | scalony (SW 1.1.565, #1017) |
| 3 | Karta GH w zakładce: „Przegląd \| Trend dawki \| Analiza”; „Trend leczenia GH” przeniesiony z „Siatek centylowych” | w tym PR (SW 1.1.566) |
| 4 | Uzgodnienie z kartą B1 nowej strony głównej (D5): te same karty leczenia w „Monitorowaniu leczenia” | do zrobienia, po scaleniu karty B1 |

## Etap 1 — co zrobiono

- Zakładka `data-tab="leczenie"`, etykieta „Leczenie”, liniowa ikona tabletki; tylko gdy Karta ma co najmniej jeden blok
  leczenia (GH, grupa otyłości, także karta „wg notatek”). Pacjent bez leczenia: sześć zakładek jak dotąd.
- Domyślnie „Status”. „leczenie” przyjmują opcja `activeTab` w `showPatientCard`, `xa.restoreTab` (powrót „wstecz”),
  stan nawigacji i przebudowa po `vilda:sync-merged`; prośba o „leczenie” u pacjenta bez leczenia → „Status”.
- W zakładce dzisiejsze bloki bez zmian wyglądu i działania; kolejność D2. Przebudowa grupy otyłości (zapis wpisu,
  „Pokaż wszystkie”, „Usunięte wpisy”) zostaje w zakładce i odświeża pasek; przełącznik cykli w panelu nie zmienia paska
  (pasek opisuje bieżący cykl).
- Pasek: miętowy przycisk z odznaką i stanem jak w podsumowaniu, wartościami i pigułką oceny; komputer — jedna linia
  i „Leczenie →”, telefon — dwie linie i „›”. Kliknięcie otwiera zakładkę i przewija do bloku leczenia.
- „Notatki”: „Wpisy leczenia otyłości (N) — Leczenie →” otwiera zakładkę „Leczenie” i przewija do „Wpisy leczenia”.

## Etap 1 — rozstrzygnięcia wykonawcy

Decyzje właściciela 2026-11-20 (po przeglądzie PR etapu 1):
- **zaakceptowane:** zawijanie siedmiu zakładek 5 + 2 przy 1025–1200 px, trzy linie paska zakończonego GH na telefonie,
  czas leczenia otyłości na pasku tylko przy punkcie „Włączenie”;
- **brzmienie D1 bez zmian** — także „20 tyg. · ⏳ oceń po 12 tyg.” (12 tygodni od dawki podtrzymującej wyjaśnia panel);
- **GH wznowione po przerwie** — do osobnej poprawki (P-GH-WZNOWIENIE): dziś „leczenie zakończone” to każdy punkt
  „Zakończenie” w historii GH (warunek znacznika podsumowania), więc wznowione leczenie jest opisane i sortowane jako
  zakończone, a czas liczy się od pierwszego „Włączenia”. Reguła wybrana przez właściciela (2026-11-20): **od
  wznowienia** — stan „aktywne”, a „Włączenie”, czas leczenia, tempo i ΔhSDS liczone od ostatniego „Włączenia” po
  „Zakończeniu” (jak nowy cykl leczenia otyłości); wcześniejszy kurs zostaje w punktach i trendzie. Osobny PR po etapie 1
  — stan niżej, „P-GH-WZNOWIENIE”.

Opis rozstrzygnięć:

- Szerokość 1025–1200 px (kolumna Karty 675 px): siedem zakładek nie mieści się w jednym wierszu — zakładki, które się
  nie mieszczą, schodzą do drugiego rzędu (5 + 2) zamiast ucinać etykiety. Na komputerze 1280 px i szerszym — jeden wiersz.
- Karta „wg notatek” ma pasek z ostatnią dawką z notatki (bez czasu, redukcji i pigułki); „przerwane (wg notatek)”
  liczy się do kolejności D2 jak zakończone.
- Czas leczenia otyłości na pasku tylko przy punkcie „Włączenie” (jak dla GH): „Czas od 1. punktu” nie jest czasem leczenia.
- Telefon, GH zakończone: „Leczony hormonem wzrostu (rhGH)” i „leczenie zakończone” nie mieszczą się w jednym wierszu
  393 px — stan schodzi pod znacznik (pasek ma trzy linie). O1 i G1 (trwające) — dwie linie.
- Przewinięcie: pierwsze leczenie w zakładce — pasek zakładek na górę widoku (pod nim początek zawartości), kolejne — jego
  pierwszy blok. Liczone na przewijanym kontenerze Karty, bo `custom-fixes.js` podmienia `Element.scrollIntoView` na
  stronie formularza (telefon: nic, komputer: przewinięcie okna) — także odnośnik z „Notatek” dotąd nie przewijał.

## Etap 2 — co zrobiono

Decyzja właściciela: „zaczynaj etap 2” (2026-11-21), według makiety hybrydy z 2026-11-19. Opis techniczny:
`docs/clinical/ALGORITHMS.md`, wpis „P-KARTA-LECZENIE, etap 2”; łatki: `docs/ZRODLA_ARTEFAKTOW.md`.

- Grupa otyłości w zakładce „Leczenie” jest jedną miętową kartą leczenia (kontener podsumowania): nagłówek ze
  znacznikiem, stanem i „+ Kontynuacja” (ten sam przycisk i ta sama obsługa co w „Wpisach leczenia”; po Zakończeniu —
  wyjaśnienie DZ-5 pod nagłówkiem), przełącznik „Przegląd | Wpisy (N) | Analiza”, domyślnie „Przegląd”.
- Przegląd: kafelki Aktualna dawka, Czas leczenia, Masa, BMI (komputer 1 × 4, telefon 2 × 2) i linia oceny wg ChPL
  (tytuł i pierwsze zdanie tej samej oceny co pole oceny) z „Szczegóły oceny” → „Analiza”. Wartości z tych samych
  obliczeń co „Dane analityczne”, bez nowych progów i zdań.
- Wpisy: sekcja bez nagłówka, objaśnienia pod „Jak działa dziennik leczenia ⌄” (opcja `uklad: 'karta'` w
  `VildaDziennikOtylosciUI.sekcja`; bez opcji sekcja jak dotąd). Analiza: panel rozwinięty, bez belki, z cichą linią
  „lek · substancja · punkty kontrolne”.
- Wybrany widok zostaje po zapisie wpisu, „Pokaż wszystkie”, „Usunięte wpisy” i odświeżeniu po synchronizacji; nowe
  otwarcie Karty — „Przegląd”. „Notatki” → widok „Wpisy”. GH, karta „wg notatek” i pasek leczenia — bez zmian.

## Etap 2 — rozstrzygnięcia wykonawcy (do przeglądu właściciela)

- Pierwsze zdanie opisu oceny kończy kropka (także „.)”) przed wielką literą; separator „ · ” nie kończy zdania, więc
  przy odpowiedzi wystarczającej/niewystarczającej linia zawiera też regułę ChPL (2 linie na komputerze). Tekst bez zmian.
- Częstość leku w podpisie dawki: lek rozpoznany jak w ocenie ChPL, wartość jak w katalogu leków `obesity_therapy.js`
  (Wegovy, Mounjaro „1×/tydz.”, Saxenda „1×/dobę”); Mysimba („wg titracji”) bez częstości; bez dawki — bez podpisu.
- „od” dawki — porównanie tekstu dawki (jak w podsumowaniu): inny zapis tej samej dawki przerywa ciąg (podpis nie
  zawyża czasu stosowania dawki).
- „Czas od 1. punktu” (bez Włączenia) — bez podpisu (podpis „od … (wiek)” tylko z punktu Włączenia).
- BMI w „Przeglądzie” bez jednostki i z szarym podpisem (jak makieta); kolor good/bad tylko w podpisie „Masy”.
- „Poprzednie cykle”, ramka „Brak punktu „Włączenie”” i nota „Zapis cyklu wymaga uporządkowania” zostają pod
  nagłówkiem karty (w każdym widoku), bo dotąd stały w podsumowaniu widocznym zawsze.
- Moduł progów ChPL niezaładowany — bez linii oceny (pole w „Analizie” zostaje). Telefon: „Szczegóły oceny” i „Jak
  działa…” z celem dotyku 44 px.

## Etap 3 — co zrobiono

Decyzja właściciela: „Etap 3, karta leczenia GH” (2026-11-21), według makiety hybrydy z 2026-11-19. Opis techniczny:
`docs/clinical/ALGORITHMS.md`, wpis „P-KARTA-LECZENIE, etap 3”; łatki: `docs/ZRODLA_ARTEFAKTOW.md`.

- Grupa GH w zakładce „Leczenie” jest jedną miętową kartą leczenia (kontener podsumowania): nagłówek ze znacznikiem,
  stanem, „kurs k z N”, „🔄 zmiana preparatu” i cichym tekstem „Program SNP · 7 punktów kontrolnych” (z dymkiem pełnej
  nazwy programu; telefon — pod znacznikiem), bez przycisków. „Preparaty (historia)”, ramka „Brak punktu włączenia…”
  i informacja W2 zostają nad przełącznikiem.
- Przełącznik „Przegląd | Trend dawki | Analiza”, domyślnie „Przegląd”; „Trend dawki” tylko wtedy, gdy trend rysuje się
  z punktów GH (inaczej „Przegląd | Analiza”, a trend z Terminarza zostaje w „Siatkach centylowych”).
- Przegląd: kafelki Preparat i dawka, Czas leczenia (bez Włączenia „Czas od 1. punktu”), Tempo wzrastania, Odpowiedź
  (ΔhSDS) — z tych samych obliczeń co pola podsumowania i kafelki panelu (bieżący kurs), komputer 1 × 4, telefon 2 × 2.
- Trend dawki: dzisiejszy „Trend leczenia GH” w białej ramce, bez własnego nagłówka; znika z „Siatek centylowych”, gdy
  karta go pokazuje. Analiza: panel „Dane analityczne” rozwinięty, bez belki, z cichą linią „program · preparat ·
  ostatnia kontrola”.
- Widok zostaje po odświeżeniu po synchronizacji; nowe otwarcie Karty — „Przegląd”. Przycisk notatki GH: „↗ Trend dawki /
  punkt GH” — bez punktu GH zakładka „Leczenie” z kartą na „Trendzie dawki” (bez karty z trendem — „Siatki centylowe”),
  z punktem — DocPro jak dotąd. Karta otyłości, pasek leczenia i reszta Karty bez zmian.

## Etap 3 — rozstrzygnięcia wykonawcy (do przeglądu właściciela)

- W2 (Kontynuacja po Zakończeniu bez Włączenia): kafelek ma etykietę „Czas leczenia” (nie „Czas od 1. punktu”), wartość
  „—” i podpis „brak Włączenia po Zakończeniu” — jak kafelek panelu „Przyrost od Włączenia”, który też nie liczy od
  pierwszego punktu kursu.
- Gdy Włączenie jest jedynym punktem kursu (0 miesięcy), „Czas leczenia” ma „—” z podpisem „od {wiek}” — panel nie podaje
  wtedy „przez N mies.”, a pasek pomija czas.
- Increlex bez dawki dobowej w mg (stary punkt bez `doseAbs` i bez masy): kafelek „0,04” + „mg/kg na podanie”, podpis —
  sam preparat (tekst pola „Aktualna dawka” to wtedy samo „0,04 mg/kg na podanie”). Brak dawki — „—” z preparatem
  w podpisie (pole „Preparat” było zawsze).
- Podpis ΔhSDS bez Włączenia ma dwie części („hSDS a → b” i „od 1. punktu”), które przy wąskim kafelku łamią się na
  granicy części (`Ko_podpisy`), jak podpisy etapu 2; podpis tempa — jedna część, jak w panelu.
- Notatka GH bez punktu: widok „Trend dawki” jest zapamiętany jak wybór lekarza (zostaje po odświeżeniu po
  synchronizacji); karta przewija się na górę widoku, a fokus trafia na „Trend dawki” (jak „Notatki” → „Wpisy” w etapie 2).
  Trend rysuje się po odczycie notatek (IGF-1) — gdy Karta była jeszcze za krótka, by przewinąć, przewinięcie powtarza się
  po narysowaniu trendu (o ile lekarz nie zmienił w tym czasie widoku).
- Nagłówek tabeli trendu w karcie: przezroczyste tło i kolor `--text-strong` (#0f2b33); w „Siatkach” bez zmian (trend
  z Terminarza).
- Ostatnia kontrola bez wieku (punkt z wiekiem 0) — część „ostatnia kontrola …” pominięta w cichej linii (pole
  pokazywało „w wieku —”).
- Na prawdziwej stronie trend Increlex z punktów pokazuje % dawki zalecanej (moduł odcinków jest załadowany) — jak dotąd;
  legenda „dawka (mg/kg na podanie)” zostaje tam, gdzie % nie ma (bez zmian `Pl`).

## P-GH-WZNOWIENIE — GH wznowione po Zakończeniu

Decyzje właściciela 2026-11-20 (W1–W4): stan „aktywne”, „Włączenie”, czas, przyrost, tempo i ΔhSDS od bieżącego kursu
(od ostatniego Włączenia); Kontynuacja po Zakończeniu bez nowego Włączenia — „aktywne”, bez czasu i ΔhSDS, z prośbą
o dopisanie Włączenia (w części 1 sama informacja o braku Włączenia; od części 2 prośba o dopisanie w DocPro); granica kursu = samo Zakończenie, w Karcie i w analizie trajektorii, bez progu 3 mies.; po Zakończeniu DocPro przyjmuje tylko nowe Włączenie (W2). Opis:
`docs/clinical/ALGORITHMS.md`, wpisy „P-GH-WZNOWIENIE, część 1” i „część 2”.

| Część | Zakres | Stan |
|---|---|---|
| 1 — odczyt | Jedna reguła kursów GH (`VildaTrajectoryAnalysis.ghKursy`); Karta: podsumowanie („kurs k z N”, „n w kursie (M łącznie)”), „Dane analityczne”, pasek i kolejność D2, trend (linia przerwana), pas na siatkach na kurs, panele trajektorii i porównania; trajektoria: kursy bez progu przerwy, przycięcie startu, żeton na kurs | scalona (SW 1.1.562, #1011) |
| 2 — wpis w DocPro | Reguła kursów we wpisie (`vilda_gh_punkty.js` wersja 4: Włączenie po Zakończeniu, bez Kontynuacji po Zakończeniu bez Włączenia; monitor — przyciski, formularz wsteczny, edycja; panel wiersza), tabela monitora wg wieku z wierszem „Kurs k — …”, metryki, B.64 i odcinki leków per kurs, wizyta kontrolna Terminarza z ostatniego punktu wg wieku, ramka W2 z prośbą o DocPro | w tym PR (SW 1.1.564) |

## Uzgodnienie z kartą B1 (D5)

Karta B1 (nowa strona główna, otwarty szkic #1009 na gałęzi strony głównej, zmienia `vilda_cykle_leczenia.js`) ma użyć
w „Monitorowaniu leczenia” tych samych kart leczenia co zakładka „Leczenie”. Etap 1 nie zmienia `vilda_cykle_leczenia.js`;
wartości paska powstają w tych samych funkcjach Karty co bloki (`wl`, `kl`, `Cl`, `Ml`, `jl` z obiektem wyjściowym),
więc karta B1 może przejąć zarówno bloki, jak i pasek bez drugiego źródła liczb i zdań oceny.
