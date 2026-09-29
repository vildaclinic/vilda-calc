# Accordion

Natywny `<details>` jako prymityw rozwijania treści: mała karta słownika z pogrubioną teal etykietą, płaskie rozwinięcie z górną linią i trójkątem przed etykietą, przycisk z panelem `[hidden]` albo nagłówek listy z licznikiem, który zwija wiersze pod sobą.

## Kiedy używać

- Karta słownika (`#thyroidCancerKidsCard .thy-glossary details`) — objaśnienia pojęć w module raka tarczycy u dzieci na `docpro.html` („Bethesda III (AUS/FLUS) u dzieci – co to znaczy?”, „EU‑TIRADS‑PL – tabela i kryteria”).
- Płaskie rozwinięcie (`.current-summary-prognosis`) — dodatkowe wiersze pod podsumowaniem wyników, np. „Pozostałe metody prognozy (3)” z notą o źródle wartości; tworzone przez `vilda_patient_report.js`.
- Przycisk z panelem (`.adv-growth-result-details`) — szczegóły w zaawansowanych obliczeniach wzrostowych („Szczegóły” / „Ukryj szczegóły”), panel przełączany atrybutem `hidden`.
- Nagłówek listy z licznikiem (`.adv-history-toggle`) — „Poprzednie pomiary” w karcie „Zaawansowane obliczenia wzrostowe” na `index.html` (P-HISTORIA-ZWIJANA): licznik pomiarów, w stanie zwiniętym jedna linia podsumowania („wiek 4 l. – 9 l. · najnowszy: 129,1 cm · 27,0 kg”), akcja „Rozwiń”/„Zwiń”. Do list wpisów, które rosną z czasem i których wiersze są formularzem; stan zwinięcia jest preferencją widoku, nie danymi.
- Nie do sekcji strony ustawień — tam służy `SettingsAccordion`.

## Co dostarcza konsument

- Słownik: kontener `div#thyroidCancerKidsCard` → `div.thy-glossary` → `details.thy-glossary-item` → `summary` (z `<strong>` na haśle) + `div.thy-glossary-body` (akapity, `code`). Reguły źródła są zakotwiczone w `id="thyroidCancerKidsCard"`, więc ten `id` jest wymagany; podgląd używa tego samego `id`.
- Rozwinięcie: `details.current-summary-prognosis` → `summary` (tekst) + `div.current-summary-prognosis-body` z `div.current-summary-prognosis-nota` i wierszami `div.current-summary-row` (flex, .95rem, `margin-top:.4rem`; skrypt `vilda_patient_report.js` może dodatkowo nadać im kolor inline).
- Przycisk z panelem: `div.adv-growth-result-details` → `button.adv-growth-result-details-btn[aria-expanded]` + `div.adv-growth-result-details-panel[hidden]` z `p.adv-growth-result-details-copy`. Przycisk nie ma własnego wypełnienia — dziedziczy globalny styl `button` i regułę szkła.
- Nagłówek listy: `button.adv-history-toggle[aria-expanded][aria-controls]` z trzema dziećmi w tej kolejności: `span.adv-history-chevron` (Lucide `chevron-right`, 18 px, obracany o 90° przy `aria-expanded="true"`), `span.adv-history-main` (`span.adv-history-line` z `span.adv-history-title`, licznikiem `span.porownanie-chip.adv-history-count` i opcjonalnym znacznikiem `span.pt-pill.status-improve.adv-history-invalid[hidden]` z ikoną `triangle-alert`; pod nią `span.adv-history-summary[hidden]`) oraz `span.adv-history-action` („Rozwiń”/„Zwiń”). Przycisk stoi PRZED kontenerem wierszy, nie w nim; opcjonalny drugi przycisk `button.adv-history-bottom` („Zwiń poprzednie pomiary”, Lucide `chevron-up`) stoi pod listą. Kontener wierszy dostaje klasę `adv-history-collapsed`, a wiersze atrybut `data-adv-history="ukryty"` (chowany) albo `"nowy"` (widoczny, z etykietą „Nowy pomiar” z `::before`) — oba ustawia `vilda_adv_history_collapse.js`.
- Stan otwarcia to atrybut `open` na `<details>` (przeglądarka przełącza go sama), `hidden` na panelu (przełącza skrypt) albo `aria-expanded` na nagłówku listy (przełącza skrypt).

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `#thyroidCancerKidsCard .thy-glossary details` | tło `--card`, obrys 1px `#d0dede`, promień `--radius`, cień `--shadow`, padding `.65rem .85rem`, `margin-top:.6rem` |
| `… .thy-glossary summary` | kursor `pointer`, 700, kolor `--primary`, bez `outline`; natywny znacznik zmniejszony `scale(.9)` |
| `… .thy-glossary-body` | `margin-top:.55rem`, .93rem, `--text`, `line-height:1.45`; `code` tło `#0000000f`, promień 6px |
| `.current-summary-prognosis` | `margin-top:.7rem`, górna linia `rgba(0,131,141,.16)`, `padding-top:.6rem` |
| `.current-summary-prognosis>summary` | flex, `gap:.4rem`, .9rem/600 `--primary`, bez znacznika, `padding:.25rem 0`, `user-select:none`; `::before` „▸” (.9em), po otwarciu „▾” |
| `.current-summary-prognosis>summary:focus-visible` | obrys `2px solid --primary`, offset 2px, promień 4px |
| `.current-summary-prognosis-body` / `-nota` | `margin-top:.4rem` / .78rem `#5c6d6d`, `line-height:1.45`, `margin-bottom:.45rem` |
| `.current-summary-row` | flex, `align-items:center`, .95rem, `margin-top:.4rem` (pierwszy wiersz bez marginesu); kolor dziedziczony (`--text`) albo nadany inline przez skrypt |
| `.adv-growth-result-details` | kolumna flex, `gap:.6rem`, margines `.55rem 0 .2rem`; wewnątrz `.adv-growth-result-block--reliability` górny margines 0 |
| `.adv-growth-result-details-btn` | `width:100%`, `display:block` |
| `.adv-growth-result-details-panel` | padding `.95rem 1rem`, promień 14px, obrys `rgba(0,131,141,.14)`, tło `180deg,#f8fbfbf5,#f4fafaf5`; `[hidden]` → `display:none!important`; `p` bez marginesu; `.adv-growth-result-details-copy` `color:inherit` |
| `.adv-history-toggle` | flex, `align-items:center`, `gap:--space-0-65`, `width:100%`, `min-height:52px`, `margin:--space-1 0 0`, padding `--space-0-65 --space-0-75 --space-0-65 --space-0-65`, tekst do lewej, `line-height:1.3`, `scroll-margin-top` o wysokość paska chrome + 12px |
| `.adv-history-chevron` | koło 30px, obrys `#cfe2e5`, tło `#e6f4f5`, kolor `--primary`; `svg` `transition: transform .18s ease` (wyłączone przy `prefers-reduced-motion`), przy `aria-expanded="true"` `rotate(90deg)` |
| `.adv-history-title` / `.adv-history-summary` / `.adv-history-action` | 1rem/600 `--text-heading` / .8125rem `--text-muted`, `line-height:1.35` / .875rem/600 `--primary` |
| `.adv-history-count` | `.porownanie-chip` z `line-height:1.3` („6 pomiarów”, odmiana 1 pomiar / 2–4 pomiary / 5+ pomiarów) |
| `.adv-history-invalid` | `.pt-pill.status-improve` jako inline-flex z ikoną, `gap:--space-4px`, padding `2px --space-8px`, pigułka, .75rem/600, `nowrap`; widoczny tylko przy zwiniętej liście, gdy ukryty wiersz ma pole poza zakresem min/max pola („Do poprawy: 1”) |
| `.adv-history-bottom` | flex, wyśrodkowany, `width:auto`, `min-height:44px`, .875rem/600; `svg` w `--primary`; pokazywany przy rozwiniętej liście od 3 pomiarów |
| `#advMeasurements.adv-history-collapsed > .measure-row[data-adv-history="ukryty"]` | `display:none` |
| `… [data-adv-history="nowy"]::before` | etykieta „Nowy pomiar” w kształcie `.porownanie-chip` (tło `#e6f4f5`, tekst `#0a6b73`, obrys `#cfe2e5`, .8rem/600), wyśrodkowana nad wierszem, `margin-top:--space-0-85` |
| Szkło (`.liquid-ios26 button`) | przycisk szczegółów i nagłówek listy stają się białą pigułką `#fff3` z obrysem `--lg-border`, tekstem `#111`, promieniem 14px; nagłówek listy nie ma własnego tła ani obrysu, a kolory niesie treść (`span`) |
| Wysoki kontrast | brak osobnych reguł dla tych czterech rodzin (poza globalnym obrysem `summary:focus-visible` i `button:focus-visible`) |

## Tokeny

`--card`, `--radius`, `--shadow`, `--primary`, `--text`, `--lg-border`; nagłówek listy: `--text-heading`, `--text-muted`, `--radius-pill`, `--border-hairline`, `--space-0-35`, `--space-0-65`, `--space-0-75`, `--space-0-85`, `--space-1`, `--space-0-6`, `--space-4px`, `--space-6px`, `--space-8px`, `--chrome-strip-height`.

## Zasady

- Etykieta `summary` jest zawsze tekstem; stan pokazuje znacznik (natywny w słowniku, „▸/▾” w rozwinięciu) albo tekst przycisku („Szczegóły” / „Ukryj szczegóły”) z `aria-expanded`.
- Nie zagnieżdżaj `.current-summary-prognosis` w karcie słownika; to dwa różne konteksty (raport vs. moduł).
- W słowniku hasło w `<strong>`, objaśnienie po „–”; treść w `.thy-glossary-body` może mieć listy `ul.thy-list`.
- Kolor teal `--primary` na etykiecie ma kontrast 4,28:1 na `--card` — używaj go tylko przy wadze 600–700, jak w źródle.
- Na szkle karta słownika nie ma osobnej reguły (tło `--card` pozostaje kryjące); zmienia się tylko przycisk szczegółów.
- Nagłówek listy: zwinięcie jest widokiem, nie filtrem — wiersze zostają w DOM i w obliczeniach, licznik liczy wszystkie pomiary (także ukryte), a stan zapisuje się jako preferencja konta, nigdy w danych pacjenta. Przycisk stoi poza kontenerem wierszy (kliknięcia w kontenerze uruchamiają autozapis). Rozwinięta lista jest stanem domyślnym; wiersz dopisany przy zwiniętej liście zostaje widoczny do następnego zwinięcia. Liczba i jednostka są rozdzielone twardą spacją. Przy zerze pomiarów przycisku nie ma — zostaje zwykły nagłówek „Wprowadź poprzednie pomiary”.

Wersja statyczna, przepisana ręcznie z style.css, docpro.html, vilda_patient_report.js, vilda_advanced_growth.js, inline_index_00.css, vilda_adv_history_collapse.js
