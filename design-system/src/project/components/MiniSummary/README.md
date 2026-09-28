# MiniSummary

Skrót danych pacjenta w bocznej kolumnie desktopu: wyśrodkowana pigułka wieku z plakietką „Wiek” i pionowy stos wierszy Waga / Wzrost / BMI / Pow. ciała, budowany przez `custom-fixes.js` po każdym przeliczeniu.

## Kiedy używać

Wyłącznie na desktopie (≥992px) na stronach z kalkulatorem: skrypt wstawia `#miniSummary` do `.decor-sidebar` (`#vildaShellDecor` w powłoce) albo — gdy kolumny dekoracyjnej nie ma — chrome przenosi go do `.sidebar-extras` paska bocznego. Blok jest `display:none`, dopóki nie ma treści; wtedy skrypt ustawia `style="display:block"`, a `.decor-sidebar` dostaje `decor-sidebar--has-content`. Nie używaj go do wyników w treści strony (od tego są ResultPanel i SummaryGrid) ani na telefonie.

## Co dostarcza konsument

- `<div id="miniSummary" class="mini-summary" style="display:block"><div id="miniSummaryContent">…</div><div id="miniShortcutsContainer" class="mini-shortcuts">…</div></div>`. Skrypt szuka `#miniSummary` i `#miniSummaryContent`; kontener skrótów wypełnia ShortcutsEditor.
- Treść: `<div class="ms-patient-chip"><div class="ms-avatar-wiek">Wiek</div><span class="ms-patient-age">8 lat i 3 miesiące</span></div>` i `<div class="ms-chips">` z wierszami MiniSummaryChip: `<div class="ms-chip ms-chip--normal|--borderline|--alert|--neutral"><div class="ms-chip-icon">W</div><div class="ms-chip-main"><span class="ms-chip-label">Waga</span><span class="ms-chip-value">27,5&thinsp;kg</span></div><div class="ms-chip-badge">55 centyl</div></div>`. Litery ikon: W (Waga), H (Wzrost), B (BMI), S (Pow. ciała); plakietka to centyl z `formatCentile` + `centylWord` („55 centyl”, „<1 centyla”, „>99 centyla”); Pow. ciała nie ma plakietki i jest zawsze `--neutral`.
- Kontekst decyduje o tle: wewnątrz `aside.sidebar-v2 .sidebar-extras` blok staje się wpuszczoną kartą; wewnątrz `.has-vilda-chrome .decor-sidebar` jest przezroczysty; poza chrome to biały blok `sidebar.css`.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.mini-summary` (sidebar.css, ≥992px) | `display:none`, `position:sticky; top:0; left:0; z-index:5`, `padding:.75rem .5rem`, górny obrys `1px solid #d0dede`, tło `#fff!important`, `.9rem`, `line-height:1.35`; `.ms-row+.ms-row` `margin-top:.35rem`; `.result-val` 600/1rem; `.mini-shortcuts` `margin-top:.55rem`, górny obrys `rgba(0,131,141,.15)`, `padding-top:.5rem`. |
| `.has-vilda-chrome aside.sidebar-v2 .mini-summary` | `margin:.5rem 0 0`, `padding:.75rem .6rem!important`, promień 10px, obrys `1px solid rgba(0,131,141,.1)`, tło `#ffffffd9!important`. |
| `.has-vilda-chrome .decor-sidebar .mini-summary` (≥1400px) | `position:static`, tło przezroczyste `!important`, bez obrysu, `padding:.25rem 0`. |
| `.ms-patient-chip` | Wiersz wyśrodkowany, `gap:.45rem`, `padding:.4rem .7rem`, promień 999px, tło `#00838d14`, obrys `1px solid rgba(0,131,141,.2)`, `margin-bottom:.5rem`. |
| `.ms-avatar-wiek` | Plakietka `padding:.1rem .45rem`, promień 6px, tło `primary`, `#fff`, `.62rem`/700, `.04em`, wersaliki, `line-height:1.5`. |
| `.ms-patient-age` | `.82rem`/600 w `primary`, `line-height:1.2`. |
| `.ms-chips` | Kolumna flex, `gap:.3rem`. |
| `.ms-chip` | Wiersz `gap:.4rem`, `padding:.35rem .5rem`, promień 10px, obrys `1px solid #d0dede`, tło `#ffffff8c`, `min-height:36px`; `--normal` obrys `#00838d47` tło `#00838d0f`; `--borderline` `#c75d0047`/`#c75d000f`; `--alert` `#c628284d`/`#c628280f`; `--neutral` `#d0dede`/`#ffffff8c`. |
| `.ms-chip-icon` | Koło 22px, `.65rem`/700; `#00838d1f`/`#00535a`; `--borderline` `#c75d001f`/`#7a3800`; `--alert` `#c6282824`/`#7a1a1a`; `--neutral` `#5a72741a`/`#5a7274`. |
| `.ms-chip-label` / `.ms-chip-value` | `.64rem`/500 wersaliki `.04em` `#5a7274` / `.84rem`/700 `#1a3536`, `line-height:1.2`; w `--normal` oba `#00535a`, `--borderline` `#7a3800`, `--alert` `#7a1a1a`, `--neutral` `#5a7274`/`#1a3536`. |
| `.ms-chip-badge` | `.64rem`/700, `padding:.12rem .38rem`, promień 999px, `#00838d24`/`#00535a`, `white-space:nowrap`; tony jak ikona (`#c75d0024`/`#7a3800`, `#c6282824`/`#7a1a1a`, `#5a72741a`/`#5a7274`). |

Szkło nie ma reguł dla bloku (ma je tylko lista skrótów ShortcutsEditor); wysoki kontrast i ciemne tło również nie — kolory tonów są wpisane szesnastkowo i nie zależą od motywu.

## Tokeny

`--primary`; pozostałe wartości są literałami w źródle (`#d0dede`, `#00535a`, `#7a3800`, `#7a1a1a`, `#1a3536`, `#5a7274`).

## Zasady

- Rób: ton wiersza wybieraj z centyla tą samą funkcją co skrypt (`normal` w normie, `borderline` na granicy, `alert` poza zakresem, `neutral` bez oceny); ton zawsze idzie w parze z plakietką centyla, nigdy samym kolorem.
- Rób: wartości zapisuj po polsku — przecinek dziesiętny i cienka spacja przed jednostką (`27,5&thinsp;kg`, `0,96&thinsp;m²`).
- Rób: gdy nie ma danych, zostaw blok `display:none` — pusta karta w pasku wygląda jak błąd.
- Nie rób: nie umieszczaj bloku poza `.sidebar-extras` lub `.decor-sidebar` — bez kontekstu chrome wraca biały, przyklejony wariant `sidebar.css` z górną kreską `#d0dede`.
- Nie rób: nie zmieniaj identyfikatorów `miniSummary`, `miniSummaryContent`, `miniShortcutsContainer` — skrypt odświeża treść po `id`.
- Kontrast: `#00535a` na bieli 8.8:1 (na tle `#00838d0f` nieznacznie mniej), `#7a3800` 8.8:1, `#7a1a1a` 10.6:1, etykieta `#5a7274` 5.1:1; plakietka „Wiek” `#fff` na `primary` 4.5:1. Wiek `.ms-patient-age` w `primary` #00838d na tle pigułki `#00838d14` daje 4,1:1 — para ze źródła poniżej 4,5:1, niezmieniona; wartość `#1a3536` na bieli 13,1:1.
- Podgląd: reguły stoją w źródle w `@media(min-width:992px)` (wariant dekoracyjny ≥1400px); w partialu zakresy zdjęto, bo ramka ma 960 px. `position:sticky` bloku, paska i kolumny nadpisano w podglądzie na `static`. Kontener skrótów pominięto (jego treść to ShortcutsEditor).

Wersja statyczna, przepisana ręcznie z src/css/sidebar.css (74-93, 361-480), src/css/vilda_chrome.css (898-903, 937-941), custom-fixes.js (funkcja p, budowa #miniSummary)
