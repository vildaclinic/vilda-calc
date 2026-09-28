# Accordion

Natywny `<details>` jako prymityw rozwijania treści: mała karta słownika z pogrubioną teal etykietą, płaskie rozwinięcie z górną linią i trójkątem przed etykietą albo przycisk z panelem `[hidden]`.

## Kiedy używać

- Karta słownika (`#thyroidCancerKidsCard .thy-glossary details`) — objaśnienia pojęć w module raka tarczycy u dzieci na `docpro.html` („Bethesda III (AUS/FLUS) u dzieci – co to znaczy?”, „EU‑TIRADS‑PL – tabela i kryteria”).
- Płaskie rozwinięcie (`.current-summary-prognosis`) — dodatkowe wiersze pod podsumowaniem wyników, np. „Pozostałe metody prognozy (3)” z notą o źródle wartości; tworzone przez `vilda_patient_report.js`.
- Przycisk z panelem (`.adv-growth-result-details`) — szczegóły w zaawansowanych obliczeniach wzrostowych („Szczegóły” / „Ukryj szczegóły”), panel przełączany atrybutem `hidden`.
- Nie do sekcji strony ustawień — tam służy `SettingsAccordion`.

## Co dostarcza konsument

- Słownik: kontener `div#thyroidCancerKidsCard` → `div.thy-glossary` → `details.thy-glossary-item` → `summary` (z `<strong>` na haśle) + `div.thy-glossary-body` (akapity, `code`). Reguły źródła są zakotwiczone w `id="thyroidCancerKidsCard"`, więc ten `id` jest wymagany; podgląd używa tego samego `id`.
- Rozwinięcie: `details.current-summary-prognosis` → `summary` (tekst) + `div.current-summary-prognosis-body` z `div.current-summary-prognosis-nota` i wierszami `div.current-summary-row` (flex, .95rem, `margin-top:.4rem`; skrypt `vilda_patient_report.js` może dodatkowo nadać im kolor inline).
- Przycisk z panelem: `div.adv-growth-result-details` → `button.adv-growth-result-details-btn[aria-expanded]` + `div.adv-growth-result-details-panel[hidden]` z `p.adv-growth-result-details-copy`. Przycisk nie ma własnego wypełnienia — dziedziczy globalny styl `button` i regułę szkła.
- Stan otwarcia to atrybut `open` na `<details>` (przeglądarka przełącza go sama) albo `hidden` na panelu (przełącza skrypt).

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
| Szkło (`.liquid-ios26 button`) | przycisk szczegółów staje się białą pigułką `#fff3` z obrysem `--lg-border`, tekstem `#111`, promieniem 14px |
| Wysoki kontrast | brak osobnych reguł dla tych trzech rodzin (poza globalnym obrysem `summary:focus-visible`) |

## Tokeny

`--card`, `--radius`, `--shadow`, `--primary`, `--text`, `--lg-border`.

## Zasady

- Etykieta `summary` jest zawsze tekstem; stan pokazuje znacznik (natywny w słowniku, „▸/▾” w rozwinięciu) albo tekst przycisku („Szczegóły” / „Ukryj szczegóły”) z `aria-expanded`.
- Nie zagnieżdżaj `.current-summary-prognosis` w karcie słownika; to dwa różne konteksty (raport vs. moduł).
- W słowniku hasło w `<strong>`, objaśnienie po „–”; treść w `.thy-glossary-body` może mieć listy `ul.thy-list`.
- Kolor teal `--primary` na etykiecie ma kontrast 4,28:1 na `--card` — używaj go tylko przy wadze 600–700, jak w źródle.
- Na szkle karta słownika nie ma osobnej reguły (tło `--card` pozostaje kryjące); zmienia się tylko przycisk szczegółów.

Wersja statyczna, przepisana ręcznie z style.css, docpro.html, vilda_patient_report.js, vilda_advanced_growth.js
