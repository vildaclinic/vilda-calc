# Chip pacjenta i nawigacja powłoki

Analiza zgłoszenia z 2026-10-29, baza `audyt` `eee483016505f3267c61629af3db1216c5d79fe2`.
Dotyczy stanu zapisu pacjenta przy zmianie strony i odświeżaniu. Wszystkie próby
używają fikcyjnego sejfu w osobnym profilu przeglądarki.

## Co oznaczają kolory

| Stan | Wygląd | Znaczenie |
| --- | --- | --- |
| `saved` | zielony | Dane odpowiadają punktowi odniesienia po wczytaniu lub zapisie. |
| `dirty` | bursztynowy | Bieżące dane różnią się od tego punktu odniesienia. |
| `new_patient` | fioletowy | Formularz zawiera dane, ale wskaźnik nie zna zapisanego punktu odniesienia. |
| `hidden` | szary | Wskaźnik nie widzi danych pacjenta. |

Fioletowy nie dowodzi utraty rekordu w sejfie. W badanym kodzie może oznaczać
utratę samej referencji wskaźnika. Podobnie bursztynowy może wynikać z porównania
ustawień interfejsu, mimo że lekarz nie zmienił danych.

## Warstwy stanu

Każda ramka ma osobny formularz i osobny `VildaSaveStatusIndicator`. Ramki tej
samej karty współdzielą jednak `sessionStorage`, w tym identyfikator pacjenta,
sesję główną, sesję Klirensu i `vilda-save-ref-v1`. Ten ostatni klucz zawiera
odcisk odniesienia, znacznik zmian oraz metadane ostatniego zapisu. W powłoce
nagłówek hosta odzwierciedla wskaźnik wybranej ramki.

Przełączenie ramki nie wywołuje `pagehide`. Powłoka zapisuje więc stan strony
źródłowej przed przejściem, a stronę docelową odtwarza ze wspólnej sesji.
Odtworzenie formularza, odtworzenie pełnej sesji i wznowienie sejfu kończą się
w różnych momentach. Wskaźnik musi odróżniać taką inicjalizację od edycji.

## Ustalone przyczyny

### Klirens dopisuje ustawienia pustych kalkulatorów

Na bazowym kodzie: wczytanie zapisanego pacjenta na Start daje `saved` oraz
identyczny odcisk bieżący i referencyjny. Samo otwarcie Klirensu daje `dirty`.
Jedyną różnicą odcisków jest nowa sekcja `clcr.inputs` z domyślnymi kontrolkami,
bez nowych oznaczeń laboratoryjnych. Są to m.in. tryby wprowadzania
`concentration`, kontekst `general`, nieokreślone metadane `unknown` i domyślne
24 godziny zbiórki z pochodzeniem `assumed-24h`.

Domyślne ustawienia trafiają do wspólnej sesji Klirensu, dlatego fałszywa zmiana
przetrwa F5 i powrót na Start. Samo poprawienie koloru nagłówka nie usuwa przyczyny.
Porównanie musi traktować brak kalkulatora i jego puste ustawienia domyślne
jednakowo. Ręcznie podany czas zbiórki, jego pochodzenie, odmienne ustawienia
i rzeczywiste oznaczenia nadal muszą uczestniczyć w porównaniu.

### Lokalny `hidden` może usunąć wspólną referencję

W bazowej funkcji `B()` wskaźnika gałąź `hidden` z niepustymi danymi woła
`N()` przed odczytaniem istniejącej referencji. `N()` usuwa współdzielony
`vilda-save-ref-v1`, po czym wskaźnik przechodzi do `new_patient`.
Stan pojedynczej, jeszcze nieodtworzonej ramki może więc zniszczyć informację
o zapisie całej karty.

Ścieżkę usuwania potwierdza regresja uruchamiająca rzeczywisty kod wskaźnika
z dwoma dokumentami i wspólnym magazynem, zarówno dla danych zapisanych, jak
i rzeczywiście zmienionych. Osobna próba przeglądarkowa potwierdza stos
`U → N → B → ue` po wejściu w ten lokalny stan. W początkowych sześciu próbach
samego F5 na Start nie wystąpił naturalnie fioletowy stan; nie są one dowodem
wykluczającym wyścig odtwarzania.

### Powłoka kopiuje stan bez odpowiadającej mu referencji

Bazowe `ct()` kopiuje klasę i opis z aktywnej ramki do nagłówka, a dodatkowo
wywołuje `_forceTransition()` w ukrytych ramkach. Nie przekazuje im przy tym
odcisku odniesienia ani metadanych. Powstaje rozbieżność między wyglądem,
wewnętrznym stanem i punktem odniesienia ramki.

Przy ponownym zapisie tego samego pacjenta stara ramka może zachować dawny
odcisk: bazowy słuchacz `vilda:persist-restored` odświeża go tylko po zmianie
identyfikatora pacjenta. Zmiana wersji lub zapis wizyty tego samego pacjenta
też wymagają przejęcia aktualnej referencji.

### Osiem tras nie ma własnego wskaźnika

Wskaźnik formularza istnieje na Start, DocPro i Klirensie. Pozostałe osiem tras
powłoki go nie ładuje. Bazowe `ct()` usuwa wtedy klasę statusu z nagłówka,
a proxy zwraca `hidden`. Potwierdzono to w przeglądarce na HOMA: nazwa pacjenta
pozostaje w nagłówku, natomiast okno chipa pokazuje „Brak danych pacjenta”.
Identyfikator i zapis w sejfie nie zmieniają się.

Ten sam brak występuje przy samodzielnym otwarciu tych stron, bez powłoki.
Kontrolowany przebieg na plikach bazowego commita obejmuje 11 dokumentów tras
i F5 każdego: Start i DocPro zachowują zapis, osiem stron nie pokazuje statusu,
a Klirens zgłasza fałszywe zmiany. We wszystkich 22 punktach kontroli pacjent
oraz snapshot w sejfie pozostają te same.

### Starsza kopia Klirensu przywraca świadomie usunięty wynik

Rzeczywisty test wpisuje kreatyninę `0.8`, sprawdza `dirty`, odświeża stronę,
a następnie usuwa tę wartość. Bezpośrednio po usunięciu formularz i dedykowana
sesja Klirensu mają puste `Scr`. Sesja główna zachowuje jednak stare `Scr=0.8`.
Przy następnym przejściu na Start odtworzenie wpisuje tę starszą kopię do
dedykowanej sesji: wraca zarówno wynik, jak i bursztynowy stan chipa.

Przyczyną jest uzupełnianie pustych pól sesji głównej poprzednimi wartościami
na stronach bez `#intakePal`. To uzupełnianie służy zachowaniu pól innych stron,
ale dla dedykowanej sekcji Klirensu odtwarza też świadomie usunięte wejścia.
Dedykowana sesja musi być autorytatywna przy zapisie jej kopii w sesji głównej.
Jawne wczytanie pacjenta lub odtworzenie zapisu nadal przyjmuje wybrany rekord.

### Powiadomienie o zapisie innej karty zatwierdza bieżący formularz

Wywołanie rzeczywistego słuchacza `onPatientSaved` po zapisie pacjenta B
ustawiało `saved` także w niezapisanym formularzu pacjenta A. Referencja
otrzymywała przy tym metadane B. Powiadomienie musi być przypisane do pacjenta;
nieaktualna ramka również nie może ustanawiać wspólnej bazy.

### Wczytanie na DocPro pomija pola innych kart

Pełny zapis pacjenta C na Start, wczytanie B, a następnie ponowne wczytanie C
na DocPro ujawniło odrębną przyczynę. DocPro nie ma kontrolek wszystkich kart
Start. Pierwszy zapis sesji nowego pacjenta nie zachowywał jego niewyświetlanych
pól, m.in. PAL, tętna i kontekstu oddechowego. Powrót na Start i F5 uzupełniały
je ustawieniami kontrolek, zmieniając odcisk bez edycji.

Pierwszy zapis korzysta teraz z kopii właśnie wczytanego C, przypisanej do
konkretnej operacji. Zachowuje wyłącznie pola, których bieżący dokument nie
posiada; pola własne formularza, także puste, pozostają autorytatywne. Nie może
uzupełnić C starszymi danymi B. Kolejne zapisy zachowują ten sam podział
własności, historie oraz dedykowane sesje.

Dla starszego rekordu bez PAL brakującą wartość wyznacza istniejące API planu
i spożycia. Nie dodano nowego wzoru ani stałej medycznej. Wybór „Nowy pomiar”
może zmienić automatyczny PAL, bo usuwa antropometrię: wartość wytworzona przez
ten import musi zostać ponownie uzgodniona przed ustanowieniem referencji.
Istniejący PAL rekordu i ręczny wybór nie są zastępowane tym mechanizmem.

### Puste pola po nowym pomiarze i brak daty urodzenia

Rozgrzany Start pomijał odtwarzanie skalarów równych `null`. Po „Nowym pomiarze”
sesja miała pustą masę i wzrost, ale DOM mógł nadal pokazywać poprzedni pomiar.
Odtworzenie rozróżnia teraz brak pola w starszym formacie od jawnego `null`
lub pustego tekstu, który ma wyczyścić kontrolkę. Zero pozostaje wartością.

Zmiana pacjenta B z datą urodzenia na C bez daty nie resetowała kontrolki DOB
przed zastosowaniem C. Moduł wieku mógł więc użyć daty B zamiast ręcznego wieku C.
Jawny import resetuje DOB przez istniejącą funkcję przed odtworzeniem nowego
rekordu. Odtwarzanie tej samej sesji zachowuje wpisaną datę.

### Domyślne kontrolki Start i metadane sejfu w odcisku

Puste karty materializują także dokładnie określone domyślne ustawienia Start:
wytyczną ESC, populację zdrową i kontekst oddechowy healthy/awake. Projekcja
porównawcza utożsamia je z brakiem tych ustawień; odmienne wartości pozostają
porównywane. PAL nadal uczestniczy w porównaniu.

Pola techniczne rekordu sejfu `_contentAtISO`, `_pinnedState.h` i `_pinned`
mogły trafić do pierwszej sesji, a zniknąć po F5. Są pomijane wyłącznie na
kopii do porównania, tak samo dla bieżącej i starszej referencji. Nie zmienia
to zapisu, eksportu ani przypięcia rekordu.

## Kontrakt poprawki

- Nawigacja i odtworzenie odczytują wspólną referencję; nie ustanawiają nowego
  zapisu i nie zapisują starego formularza ukrytej ramki.
- Publikacja jest przypisana w pamięci do pacjenta, sekwencji i generacji
  operacji. Zapis tego samego pacjenta w innej ramce odświeża zarówno odcisk,
  jak i numer oraz czas zapisu.
- Lokalne `hidden` nie usuwa wspólnej referencji. Jawne czyszczenie i blokada
  sejfu zachowują własne ścieżki unieważniania.
- Powłoka wybiera gotowy wskaźnik właściwego pacjenta również na trasie bez
  własnego formularza. Nie wymusza stanów ukrytych wskaźników.
- Domyślne kontrolki Klirensu są normalizowane wyłącznie na kopii do porównania.
  Formularz, sesja, eksport, pochodzenie danych i obliczenia pozostają bez zmian.
- Rzeczywiste zmiany nadal dają `dirty`, także po nawigacji i F5. Uzgadnianie
  odtworzenia nie może anulować oczekującej obsługi rzeczywistej edycji.
- Wskaźnik doładowany na stronie bez formularza działa wyłącznie jako odbiorca.
  Nie zapisuje ani nie usuwa wspólnej referencji i nie zatwierdza danych po
  powiadomieniu o zmianie karty pacjenta. Host powłoki zachowuje własne proxy.

## Zakres sprawdzenia

Powłoka deklaruje 11 tras: Start, DocPro, Klirens, HOMA, Steroidy, Lab,
Notatki, Terminarz, Ustawienia, Materiały edukacyjne i Cukrzyca. Zakres regresji
obejmuje zimne otwarcie, F5 aktywnej trasy, przejścia pomiędzy rozgrzanymi
trasami, Wstecz/Dalej, nawigację z menu i rzeczywistą edycję danych.
Test macierzy wykonuje wszystkie 110 skierowanych przejść między różnymi
trasami. Osobne scenariusze wczytują rekord na DocPro w trybach „Odtwórz”
i „Nowy pomiar”, po czym wracają na Start i wykonują F5. Obejmują także starszy
rekord bez PAL oraz zachowanie pustych pomiarów i niezmienionego sejfu.
Instrukcje, dokumenty prawne i strony informacyjne otwierane poza tą listą
nie są dodatkowymi panelami powłoki. Repozytorium ma 22 główne dokumenty HTML:
host i 21 stron samodzielnych. Wszystkie używają mostka sesji, który na stronach
bez własnego wskaźnika doładowuje jego wersję tylko do odczytu po gotowości auth.

Wyniki końcowych sprawdzeń i dokładny commit są podawane w PR. Zmiana nie
wprowadza nowych wzorów, norm, jednostek ani interpretacji klinicznych.
