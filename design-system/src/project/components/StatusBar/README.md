# StatusBar

Stały pasek statusu zapisu na stronie głównej: biała karta z 4px lewą krawędzią w kolorze tonu, znakiem, komunikatem z odnośnikami do brakujących pól i godziną.

## Kiedy używać

Pasek zastępuje gasnący dymek przy przycisku „Zapisz” — komunikat „nie zapisano” zostaje na ekranie, dopóki kolejna akcja go nie zmieni. `vilda_status_bar.js` (`pokaz({tekst, ton, pola, kiedy})`) wypełnia wszystkie pojemniki `[data-vilda-status]` tą samą treścią; o tym, który jest widoczny, decyduje CSS na progu 700px — tym samym, na którym `#calcForm` przechodzi z jednej kolumny na dwie: `#vildaStatusForm` (góra formularza, nad polem „Nazwisko”) tylko przy <700px, `#vildaStatusSide` (prawa kolumna, nad „Podsumowaniem wyników”) tylko przy ≥700px. Tony pochodzą z wywołań zapisu: `ok` — „Zapisano (snapshot N) dla …”, `nowy` — „Zapisano nowego pacjenta: …”, `uwaga` — „Zaloguj się, aby zapisać dane pacjentów.” lub duplikat nazwiska, `blad` — „Nie zapisano — uzupełnij: wiek, masę ciała i wzrost.” z odnośnikami, `info` — „Zapis anulowany — nic nie zmieniono.”. Wylogowanie i „Wyczyść wszystkie pola” czyszczą pasek.

## Co dostarcza konsument

- Pojemnik: `<div id="vildaStatusForm" data-vilda-status role="status" aria-live="polite" hidden></div>` i `<div id="vildaStatusSide" …></div>` — puste, z atrybutem `hidden`; skrypt zdejmuje `hidden`, ustawia `data-ton` i buduje zawartość. Stylowanie idzie po `[data-vilda-status]`, `id` służą tylko marginesowi dolnemu (`0.8rem`) i przełączaniu widoczności na 700px.
- Zawartość: `<span class="vilda-status-znak" aria-hidden="true">` ze znakiem tonu (`ok` ✓, `uwaga` ●, `blad` ✕, `info` ℹ, `nowy` ＋), potem `<span class="vilda-status-tresc">` z `<span class="vilda-status-tekst">` (komunikat, w nim opcjonalne `<button type="button" class="vilda-status-link">nazwa pola</button>` przewijające do pola) i opcjonalnym `<span class="vilda-status-meta">14:32</span>` (godzina `pl-PL`, `HH:MM`).
- Odnośnik jest `<button>`, więc podlega globalnym regułom przycisków (`style.css`) i globalnemu szkłu `.liquid-ios26 button` z `!important`.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `[data-vilda-status]` | `flex`, `align-items:flex-start`, `gap:.6rem`, `.9rem/1.45`, `padding:.55rem .75rem`, promień `--radius` (12px; zapas 8px), lewa krawędź `4px solid --vilda-status-ton`, tło `#fff`, tekst `#2c3838`, cień `--shadow`. |
| `[hidden]` | `display:none!important`. |
| `[data-ton="ok"]` | Ton `#15803d`, tło `#f2fbf5`, znak ✓. |
| `[data-ton="uwaga"]` | Ton `#b45309`, tło `#fffaf1`, znak ●. |
| `[data-ton="blad"]` | Ton `#c62828`, tło `#fdf4f4`, znak ✕. |
| `[data-ton="info"]` | Ton `#00838d`, tło `#f3fafa`, znak ℹ. |
| `[data-ton="nowy"]` | Ton `#6d28d9`, tło `#f9f5ff`, znak ＋. |
| `.vilda-status-znak` | `flex:0 0 auto`, 700, `line-height:1.45` (ta sama interlinia co tekst, żeby przy łamaniu na dwie linie nie odklejał się w górę), kolor tonu. |
| `.vilda-status-tresc` | Kolumna flex, `gap:.1rem`, `min-width:0`. |
| `.vilda-status-tekst` | `overflow-wrap:anywhere`. |
| `.vilda-status-meta` | `.76rem`, `#5c6d6d`, `tabular-nums`. |
| `.vilda-status-link` | `font:inherit`, kolor tonu, bez tła i obrysu, `padding:0`, `width:auto`, podkreślenie z odsunięciem 2px, kursor wskazujący. |
| `.vilda-status-link:hover` | Grubość podkreślenia 2px; z globalnej reguły `button:hover` dochodzi `translateY(-1px) scale(1.02)`. |
| `.vilda-status-link:focus-visible` | Obrys `2px solid` w kolorze tonu, odsunięcie 2px, promień 2px; w wysokim kontraście `--hc-focus-width solid --hc-focus-color`. |
| `.liquid-ios26 button` (w aplikacji `body` ma tę klasę) | Z `!important` nadpisuje odnośnik: tło `#fff3`, obrys `1px solid --lg-border`, kolor `#111` (kolor tonu znika), promień 14px, blur 10px, cień `0 4px 12px #0000001a` — odnośnik wygląda jak mała szklana pastylka z podkreśleniem. |
| `#vildaStatusForm` / `#vildaStatusSide` | `margin-bottom:.8rem`; pierwszy `display:none!important` przy ≥700px, drugi przy ≤699px. |

Sam pasek nie ma reguł szkła, wysokiego kontrastu ani ciemnego tła — kolory tonów i białe tło są stałe; zmienia się tylko obrys fokusu odnośników i ich szkło.

## Tokeny

`--radius`, `--shadow`, `--lg-border`, `--primary`, `--secondary`, `--shadow-l`, `--anim-fast`, `--hc-focus-width`, `--hc-focus-color`; lokalna `--vilda-status-ton` (ustawiana przez `[data-ton]`).

## Zasady

- Rób: ton zawsze ze znakiem i treścią — kolor krawędzi jest tylko wzmocnieniem; `role="status"` i `aria-live="polite"` zostają na pojemniku, żeby czytnik ekranu ogłosił zmianę.
- Rób: nazwy brakujących pól w komunikacie zamieniaj na odnośniki (`pola: [{id, etykieta}]`), a nie porywaj przewijania — lekarz sam wybiera, dokąd skoczyć.
- Rób: trzymaj oba pojemniki w DOM i wypełniaj oba tą samą treścią; widoczność rozstrzyga próg 700px.
- Nie rób: nie zmieniaj progu 700px niezależnie od `#calcForm` — pasek zniknąłby albo zdublował się w pasie pośrednim.
- Nie rób: nie używaj paska do komunikatów z innych stron — to element `index.html`; poza nią służy dymek (`vilda_dymek.js`).
- Nie rób: nie dokładaj tonów poza pięcioma nazwanymi — nieznany ton skrypt zamienia na `info`.
- Kontrast (zmierzony, wartości ze źródła bez zmian): tekst `#2c3838` na tłach tonów 11,2–11,7:1; godzina `#5c6d6d` 5,06–5,23:1; znaki i odnośniki w kolorze tonu: `ok` #15803d na #f2fbf5 4,75:1, `uwaga` #b45309 na #fffaf1 4,83:1, `blad` #c62828 na #fdf4f4 5,20:1, `nowy` #6d28d9 na #f9f5ff 6,61:1, ale `info` #00838d na #f3fafa tylko 4,29:1 — poniżej 4,5:1 (znak jest `aria-hidden`, a odnośniki w tonie `info` w aplikacji nie występują).
- Podgląd: pojemniki są w normalnym przepływie (nic nie nadpisano); tylko pierwszy ma `id="vildaStatusSide"`, pozostałe pokazują tony na gołym `[data-vilda-status]`.

Wersja statyczna, przepisana ręcznie z src/css/vilda_status_bar.css (7-163), src/css/style.css (569-583, 631-635, 659-663, 5196-5198), src/css/ios26-v2.css (85-93, 97-99), vilda_status_bar.js (zbuduj, odnosnik, pokaz, ZNAKI), vilda_data_import_export.js (Bkomunikat, Bbraki, komunikaty zapisu), index.html (474, 710)
