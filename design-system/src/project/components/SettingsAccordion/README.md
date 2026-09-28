# SettingsAccordion

Natywny `<details>` strony ustawień: szklana karta o promieniu 26 px, której nagłówek `<summary>` jest siatką z kafelkiem ikony, tytułem i opisem, mini-chipami oraz okrągłym chevronem, a panel rozwija się pod cienką linią.

## Kiedy używać

- Do sekcji strony ustawień (`ustawienia.html`), które grupują przełączniki (`SettingItem`) i karty sterujące (`BackupCard`): „Widoczność kart na stronie głównej”, „Techniczny panel siatek centylowych”, „Wygląd aplikacji”, „Tryb PRO: pulsowanie ramek”.
- Do strefy niebezpiecznej (`--danger`) z nieodwracalnymi akcjami na koncie.
- Do sekcji, która wymaga zalogowania (`--locked`); klasę i dymek dokłada skrypt strony (`inline_ustawienia_07.js`), gdy użytkownik nie jest zalogowany.
- Nie do treści klinicznych w kartach wyników — tam służy `Accordion`.

## Co dostarcza konsument

- Kontener `div.settings-accordion-list` (siatka, `gap:1rem`), w nim opcjonalne etykiety grup `div.settings-group-label` (np. „Subskrypcja”, „Interfejs”) i karty `details.settings-accordion`.
- Karta: `<details class="settings-accordion" id="settings-section-…" [open]>` → `<summary>` z czterema dziećmi w tej kolejności: `span.settings-accordion-index` (ikona Lucide jako `<svg>`, 20 px), `div.settings-accordion-copy` (`h2.settings-accordion-title` + `p.settings-accordion-text`), `div.settings-accordion-meta` (0–3 `span.settings-mini-chip`), `span.settings-chevron` ze znakiem „⌄”. Po `<summary>`: `div.settings-accordion-panel > div.settings-panel-inner` z treścią (np. `p.settings-section-note`, `div.settings-grid`, `div.settings-control-grid`).
- `id="settings-section-…"` jest celem nawigacji bocznej i odnośników `href="#settings-section-sync"`; `scroll-margin-top` liczy się z `--chrome-strip-height`.
- Wysoki kontrast działa tylko, gdy `<body>` ma klasę `page-settings` (tak jak `ustawienia.html`); bez niej reguły `--hc-*` nie zadziałają.
- Stan `--locked`: skrypt zamyka kartę, dodaje klasę, podmienia zawartość chevronu na SVG kłódki (16 px, `stroke-width="2.2"`) i dokłada do `<summary>` `span.settings-lock-tip` z tekstem „Zaloguj się, aby uzyskać dostęp”; kliknięcie dodaje `.is-visible` na 2,2 s.

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `.settings-accordion` | obrys 1px `--settings-card-border`, promień 26px, tło `linear-gradient(180deg,#fffffff2,#f6fcfcc7)`, cień `0 18px 46px #07363e0f`, `overflow:hidden`, `container-type:inline-size` |
| `.settings-accordion[open]` | obrys `#00838d42`, cień `0 24px 56px #07363e17`, chevron `rotate(180deg)` |
| `.settings-accordion>summary` | siatka `auto minmax(0,1fr) auto auto`, `gap:1rem`, padding `1.15rem 1.25rem`, bez natywnego znacznika; `:focus-visible` obrys `3px solid rgba(0,131,141,.24)`, offset 3px |
| `.settings-accordion-index` | kafelek 2.6rem, promień 14px, gradient `135deg,#00b3b32e,#00838d14`, kolor `--primary` |
| `.settings-accordion-title` / `-text` | 1.06rem `#07363e` / .92rem `#567076` |
| `.settings-mini-chip` | pigułka .82rem/600, tło `#00838d14`, obrys `rgba(0,131,141,.12)`, kolor `#145861` |
| `.settings-mini-chip--expert`, `--pro` | zadeklarowane w źródle (bursztyn `#6e460014`/`#5a3c00`; teal gradient/`#005f68`, 700) **przed** regułą bazową `.settings-mini-chip`, więc przy równej specyficzności reguła bazowa je nadpisuje — w aplikacji wyglądają jak chip domyślny |
| `.settings-mini-chip--danger` | tło `#b0002012`, obrys `#b000202e`, kolor `#b00020` (reguła po bazowej, działa) |
| `.settings-chevron` | koło 2.6rem, obrys `rgba(0,131,141,.14)`, tło `#ffffffc7`, kolor `#0f5f68`, 1.15rem/700, przejście `transform .22s` (wyłączone przy `prefers-reduced-motion`) |
| `.settings-accordion-panel` / `.settings-panel-inner` | padding `0 1.25rem 1.25rem`; wnętrze `padding-top:1.2rem` z linią `rgba(0,131,141,.12)` |
| `.settings-group-label` | .72rem/700, wersaliki, `letter-spacing:.08em`, kolor `--chrome-label-color`, dolna linia `rgba(0,131,141,.1)` |
| `.settings-accordion--danger` | obrys `#b0002040`, tło `180deg,#fffafaf2,#fff5f6d9`; `[open]` obrys `#b0002066`; tytuł `#8a0018`, opis `#7a3340`, chevron `#b00020`; ikona `.settings-accordion-index--danger` gradient `#b000202e→#b0002014` |
| `.settings-accordion--locked` | `opacity:.42`, `filter:grayscale(.2)`, kursor `not-allowed`, chevron szary (`--chrome-label-color`, tło `#5a727414`) |
| `.settings-lock-tip` | ciemny dymek `#07363e`/`#fff`, .78rem, promień 8px, strzałka 5px; pozycjonowany nad `<summary>` (`bottom:calc(100% + 8px)`), więc przy `overflow:hidden` karty pozostaje odcięty |
| `@media(max-width:980px)` i `@container(max-width:660px)` | siatka 3-kolumnowa: chipy schodzą do drugiego wiersza pod tytuł (tak wygląda podgląd przy 960px) |
| `@media(max-width:720px)` | padding 1rem, chevron 2.35rem, panel `0 1rem 1rem` |
| `@media(max-width:560px)` | tryb kompaktowy: promień 10px, cień `0 2px 8px #07363e0d`, ikona 22px bez kafelka, opis i chipy ukryte, tytuł .88rem, otwarty nagłówek z tłem `90deg,#00838d14,#fff0 80%` |
| Wysoki kontrast 1–3 (`body.page-settings`) | karta `--hc-surface` z obrysem `--hc-card-border-width solid --hc-border` i `--hc-shadow`; nagłówek `--hc-module-btn-bg` (hover `--hc-module-btn-hover-bg`, otwarty `--hc-module-btn-active-bg`); ikona, chipy i chevron `--hc-button-bg` z obrysem `--hc-module-btn-border`; tytuł `--hc-text`, opis `--hc-muted` |

## Tokeny

`--settings-card-border` (przez `--chrome-glass-border`), `--chrome-label-color`, `--chrome-strip-height`, `--primary`, `--hc-surface`, `--hc-border`, `--hc-card-border-width`, `--hc-shadow`, `--hc-blur`, `--hc-module-btn-bg`, `--hc-module-btn-hover-bg`, `--hc-module-btn-active-bg`, `--hc-module-btn-active-border`, `--hc-module-btn-border`, `--hc-button-bg`, `--hc-text`, `--hc-muted`.

## Zasady

- Zachowaj kolejność czterech dzieci `<summary>`; siatka i reguły responsywne odwołują się do pozycji kolumn.
- Ikona zawsze jako `<svg>` 20 px z `stroke="currentColor"`; nie zmieniaj koloru kafelka poza wariantem `--danger`.
- Stan zablokowany ma zawsze tekst dymka i kłódkę, nie tylko przygaszenie; stan niebezpieczny ma zawsze chip „Nieodwracalne”.
- Nie dodawaj własnych kolorów chipów — w wysokim kontraście wszystkie chipy dostają jednakową powierzchnię `--hc-button-bg`.
- Na szkle (`liquid-ios26`) karta nie ma osobnej reguły: gradient pozostaje pełnokryjący; szkło zmienia tylko przyciski i pola w panelu.
- Stan `--locked` przygasza całą kartę do `opacity:.42`: tytuł `#07363e` ma wtedy zmierzony kontrast 2,41:1, a opis `#567076` 1,80:1 na bieli (poniżej 4,5:1) — to celowo nieaktywna sekcja; kłódka i dymek niosą informację o blokadzie, nie zmieniaj wartości ze źródła.
- Tytuł `h2` 1.06rem `#07363e` ma kontrast 13,07:1 na białym gradiencie; opis `#567076` 5,28:1, chip `#145861` 7,30:1, etykieta grupy `#5a7274` 5,13:1 na `--bg` (#fff; 4,84:1 na `--card`); opis `#567076` (.92rem) jest tekstem pomocniczym — nie umieszczaj w nim informacji krytycznych.

Wersja statyczna, przepisana ręcznie z ustawienia.css, style.css, ustawienia.html, inline_ustawienia_07.js
