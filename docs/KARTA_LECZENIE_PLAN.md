# Karta pacjenta: zakładka „Leczenie” — plan i decyzje (P-KARTA-LECZENIE)

Stan na 2026-11-20. Dokument utrwala ustalenia właściciela i etapy pracy, żeby kolejne PR-y i inne wątki nie odtwarzały
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
| 1 | Zakładka „Leczenie” (druga, tylko przy leczeniu) z dzisiejszymi blokami bez zmian; pasek leczenia nad zakładkami (przycisk otwierający zakładkę, wartości z tych samych danych co bloki, pigułka oceny D1); odnośniki do „Leczenia” (Notatki) | wdrożony w tym PR (SW 1.1.560) |
| 2 | Karta leczenia otyłości w zakładce: przełącznik „Przegląd \| Wpisy \| Analiza”, „Przegląd” z czterema liczbami i oceną w jednej linii | do zrobienia |
| 3 | Karta GH w zakładce: „Przegląd \| Trend dawki \| Analiza”; „Trend leczenia GH” przeniesiony z „Siatek centylowych” | do zrobienia |
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
  „Zakończeniu” (jak nowy cykl leczenia otyłości); wcześniejszy kurs zostaje w punktach i trendzie. Osobny PR po etapie 1.

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

## Uzgodnienie z kartą B1 (D5)

Karta B1 (nowa strona główna, otwarty szkic #1009 na gałęzi strony głównej, zmienia `vilda_cykle_leczenia.js`) ma użyć
w „Monitorowaniu leczenia” tych samych kart leczenia co zakładka „Leczenie”. Etap 1 nie zmienia `vilda_cykle_leczenia.js`;
wartości paska powstają w tych samych funkcjach Karty co bloki (`wl`, `kl`, `Cl`, `Ml`, `jl` z obiektem wyjściowym),
więc karta B1 może przejąć zarówno bloki, jak i pasek bez drugiego źródła liczb i zdań oceny.
