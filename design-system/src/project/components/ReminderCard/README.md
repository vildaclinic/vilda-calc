# ReminderCard

Biała karta „Przypomnienia" (promień 14 px, obrys 1 px #d8e6e7, cień 0 2px 12px #0051580f) z nagłówkiem — dzwonek 20 px w `--primary`, tytuł .98rem/700 #0c3a3e i licznik w pigułce `--primary` — oraz pastelowymi, wersalikowymi paskami sekcji „Zaległe", „Dziś" i „Oczekujące wyniki", pod którymi leżą wiersze pacjentów z awatarem 34 px, kolorową kategorią, etykietą terminu i przyciskiem „⋮" otwierającym okno szczegółów.

## Kiedy używać

- Panel przypomnień na stronie głównej (`#remindersInline`, kolumna formularza) dla zalogowanego konta; renderuje go `vilda_auth_ui.js`.
- Stan pusty („Brak przypomnień na dziś"), gdy nic nie wymaga uwagi.
- Okno szczegółów zdarzenia (`.vild-rem-dlg`) po kliknięciu wiersza lub „⋮": nazwa pacjenta, tytuł, opis i przyciski akcji.

Nie używaj do listy terminów w siatce miesiąca (`Calendar`) ani do notatek (`NoteItem`).

## Co dostarcza konsument

- Opakowanie `.vild-rem-inline` (flex, kolumna) i karta `.vild-rem-card`.
- Nagłówek `.vild-rem-head` = `<span class="vild-rem-bell">` (SVG dzwonka, `stroke="currentColor"`) + `<h2 class="vild-rem-ttl">Przypomnienia</h2>` + opcjonalnie `<span class="vild-rem-chip">` z liczbą.
- Treść `.vild-rem-body` z sekcjami `.vild-rem-sec.vild-rem-sec-over|-today|-pend`; każda ma pasek `.vild-rem-sec-head` z dwoma `<span>` (etykieta, liczba). W sekcji „Oczekujące wyniki" kategorie grupuje zwijany nagłówek `.vild-rem-cat-head` (`.vild-rem-caret` ▾/▸, `.vild-rem-cat-nm`, `.vild-rem-cat-n`, `aria-expanded`, kolor i tło kategorii w atrybucie `style`) i kontener `.vild-rem-cat-rows`.
- Wiersz `.vild-rem-row` (`role="button"`, `tabindex="0"`, `aria-label="Szczegóły: …"`) = `.vild-rem-av` (inicjał; tło `linear-gradient(135deg, akcent, akcent + "cc")` w `style`) + `.vild-rem-meta` (`.vild-rem-nm`, `.vild-rem-cat` z kropką `.vild-rem-dot` w kolorze akcentu) + `.vild-rem-when.w-over|w-today|w-pend` + `<button class="vild-rem-more" aria-label="Szczegóły i akcje">` z SVG trzech kropek.
- Kolory kategorii pochodzą z danych (JS ustawia `style`): Kontrola #0E6E99/#E7F6FD/akcent #32ADE6, Obserwacja #0A5BBF/#E5F1FF/#007AFF, Leczenie #1F7A3D/#E8F8EC/#34C759, Badanie #4341B5/#EDEDFB/#5856D6, Dyżur #C2271D/#FFEBEA/#FF3B30, Poradnia #8A6D00/#FFF8DB/#FFCC00, Poradnia NFZ #8A2BB8/#F6ECFC/#AF52DE, Wykład/Seminarium/Ćwiczenia #A35F00/#FFF3E0/#FF9500, Zajęcie #5A5A5F/#F2F2F4/#8E8E93.
- Stopka `.vild-rem-foot` z `<button class="vild-rem-all">Pokaż wszystkie (N) →</button>`.
- Stan pusty `.vild-rem-empty` = `.vild-rem-empty-ic` (✓) + `.vild-rem-empty-t` + `.vild-rem-empty-s`.
- Okno: nakładka `.vild-rem-dlg-ov` (fixed, `z-index` 1000001) > `.vild-rem-dlg` > `.vild-rem-dlg-head` (`.vild-rem-dlg-cat` z kolorem kategorii w `style`, `<button class="vild-rem-dlg-x" aria-label="Zamknij">×</button>`) + `.vild-rem-dlg-body` (`.vild-rem-dlg-nm`, `.vild-rem-dlg-ttl`, `.vild-rem-dlg-txt`, wiersze `.vild-rem-dlg-row` z `<b>`) + `.vild-rem-dlg-acts` z `<button>` (modyfikatory `.vild-rem-dlg-pri`, `.vild-rem-dlg-destr`, `.vild-rem-dlg-ghost`). W podglądzie okno stoi bez nakładki (sama `.vild-rem-dlg` nie jest pozycjonowana), więc nie było potrzeby nadpisywać pozycji.
- Zwijanie sekcji „Zaległe": klasa `vrc-overdue-collapsed` na `<html>` (ustawia ją `vilda_reminders_collapse.js`) chowa wszystko poza paskiem sekcji, a chevron po etykiecie obraca się o −90°.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.vild-rem-card` | tło #fff, obrys 1 px #d8e6e7, promień 14 px, cień 0 2px 12px #0051580f, `overflow:hidden` (wszystko z `!important`) |
| `.vild-rem-chip` | pigułka 999 px, .72rem/800, tekst #fff na `--primary`, wypełnienie 2px 9px |
| `.vild-rem-sec-over .vild-rem-sec-head` / `.vild-rem-when.w-over` | bursztyn: tło #fff3e0, tekst #a35f00 |
| `.vild-rem-sec-today …` / `.w-today` | zieleń: tło #e8f8ec, tekst #1f7a3d |
| `.vild-rem-sec-pend …` / `.w-pend` | indygo: tło #e9e9fb, tekst #302d9c |
| `.vild-rem-sec-head` | .72rem/800, wersaliki, odstęp liter .04em, wypełnienie 7px 16px |
| `.vild-rem-cat-head` | .71rem/700, wypełnienie 6px 16px, dolna linia 1 px #f3f7f7; `:focus-visible` obrys 2 px `--primary` do wewnątrz |
| `.vild-rem-row` | flex, odstęp 11 px, wypełnienie 10px 16px, dolna linia 1 px #f3f7f7, kursor wskazujący; `:hover` tło #f7fbfb; `:focus-visible` obrys 2 px `--primary` |
| `.vild-rem-av` | koło 34 px, inicjał .9rem/700 #fff, cień 0 1px 3px #0000002e |
| `.vild-rem-nm` / `.vild-rem-cat` | .92rem/600 #0f2b33 / .82rem #64797b, oba z wielokropkiem |
| `.vild-rem-when` | .73rem/700, promień 7 px, wypełnienie 3px 8px |
| `.vild-rem-more` | 34×32 px, obrys 1 px #d7e9ec, promień 8 px, ikona 18 px #5b6672; `:hover` tło #eef6f7, tekst #0f2b33, obrys #c4dde1 |
| `.vild-rem-all` | pełna szerokość, .82rem/600 `--primary`, tło #f0fafa, obrys 1 px #cfe8e9, promień 9 px; `:hover` #e6f5f6 |
| `.vild-rem-empty` | wyśrodkowany tekst #6b8385, ikona ✓ w kole 34 px #e8f8ec/#1f7a3d, tytuł .9rem/600 #3a4d4f |
| `.vild-rem-dlg` | tło #fff, promień 16 px, maks. 460 px, cień 0 18px 50px #00283047; nakładka `.vild-rem-dlg-ov` #0f2b3357 |
| `.vild-rem-dlg-cat` | pigułka .7rem/800 wersaliki, wypełnienie 3px 10px, kolor z kategorii |
| `.vild-rem-dlg-acts button` | .82rem/600, obrys 1 px #d7e9ec, promień 9 px, wypełnienie 8px 11px; `.vild-rem-dlg-pri` tło #00838d (`:hover` #006f78), `.vild-rem-dlg-destr` tekst #c2271d i obrys #f3c9c5, `.vild-rem-dlg-ghost` bez obrysu, tekst #5b6672 |
| `html.vrc-overdue-collapsed` | sekcja „Zaległe" zwinięta do paska; chevron obrócony |

Poniżej 699 px `.vild-rem-inline` traci minimalną wysokość (`min-height:0!important`).

## Tokeny

`--primary`; przez globalny wygląd przycisków na szkle także `--lg-border`, `--radius`, `--secondary`, `--shadow`.

## Zasady

- Rób: zawsze pokazuj liczbę w pasku sekcji i w pigułce nagłówka — kolor paska sam nie niesie znaczenia (bursztyn = zaległe, zieleń = dziś, indygo = oczekujące wyniki).
- Rób: awatar i kropka w kolorze akcentu kategorii, nazwa kategorii w jej ciemnym odcieniu — tekst zawsze towarzyszy kolorowi.
- Rób: wiersz jest klikalny (`role="button"`, `tabindex="0"`), a „⋮" ma `aria-label="Szczegóły i akcje"`; w oknie zachowaj `aria-label="Zamknij"` na „×".
- Nie rób: nie usuwaj `!important` z reguł karty — w aplikacji bronią jej przed globalnymi stylami kart i przycisków.
- Nie rób: nie mieszaj tonów sekcji z tonami etykiet terminu innego rodzaju (`.w-over` należy tylko do „Zaległe").
- Kontrast: teksty pasków i etykiet terminu (#a35f00 na #fff3e0 4.57:1, #1f7a3d na #e8f8ec 4.88:1, #302d9c na #e9e9fb 8.84:1), #64797b na bieli 4.60:1, biały na `--primary` w pigułce i `.vild-rem-dlg-pri` 4.53:1, #c2271d `.vild-rem-dlg-destr` 5.83:1 — wszystkie ≥ 4.5:1; #9aa8aa na „×" (2.45:1) to celowo wyciszony przycisk.
- Wysoki kontrast i ciemne tło: brak osobnych reguł — karta zostaje biała z obrysem #d8e6e7. Szkło: przyciski „×" i „⋮" oraz akcje okna są zwykłymi `<button>`, więc globalna reguła `.liquid-ios26 button` (tło #fff3, obrys `--lg-border`, promień 14 px, cień, tekst #111) wygrywa z ich własnym stylem tam, gdzie ma wyższą swoistość — tak wygląda to w aplikacji, w której `body` zawsze ma klasę `liquid-ios26`.

Wersja statyczna, przepisana ręcznie z src/css/style.css (4136-4341, 7289-7466), vilda_reminders_collapse.js (87-97, CSS wstrzykiwany z JS), src/css/ios26-v2.css (85-93), src/css/style.css (569-583).
