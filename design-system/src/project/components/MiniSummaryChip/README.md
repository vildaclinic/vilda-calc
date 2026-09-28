# MiniSummaryChip

Wierszowy chip podsumowania pacjenta w pasku bocznym (min. 36px, promień 10px, obrys 1px w tonie): 22px okrągła ikona literowa (W/H/B/S, .65rem/700), dwuwierszowy blok z wersalikową etykietą .64rem/.04em i wartością .84rem/700 oraz opcjonalna odznaka centyla po prawej (.64rem/700, 999px). Modyfikator tonu przebarwia jednocześnie tło, obrys, dysk ikony, tekst i odznakę.

## Kiedy używać

Wyłącznie w `.ms-chips` sekcji „mini podsumowania” paska bocznego (`aside.sidebar-v2`, widoczny ≥992px), po jednym chipie na parametr: waga, wzrost, BMI, ewentualnie płeć. Ton wybiera skrypt `custom-fixes.js` z kategorii centyla (`normal` w normie, `borderline` pogranicze, `alert` poza normą, `neutral` bez oceny; BMI z koloru kategorii VildaBmi). Nie używaj w treści karty — tam służą ResultPanel i Chip.

## Co dostarcza konsument

- `<div class="ms-chips">` (kolumna, `gap:.3rem`) z `<div class="ms-chip ms-chip--normal|--borderline|--alert|--neutral">`.
- Dzieci w tej kolejności: `<div class="ms-chip-icon">W</div>` (litera parametru), `<div class="ms-chip-main"><span class="ms-chip-label">Waga</span><span class="ms-chip-value">26,0&thinsp;kg</span></div>`, opcjonalnie `<div class="ms-chip-badge">45 c</div>`.
- Wartość formatuje skrypt: przecinek dziesiętny, `&thinsp;` przed jednostką; odznaka to centyl („92 c”, „<1 c”).
- W `sidebar.css` cały blok leży wewnątrz `@media(min-width:992px)` — chipy istnieją tylko w układzie desktopowym; partial systemu podaje reguły bez tego opakowania, żeby karta renderowała się przy 960px.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.ms-chip` | `flex`, `gap:.4rem`, `padding:.35rem .5rem`, promień 10px, obrys `1px solid #d0dede`, tło `#ffffff8c`, `min-height:36px`. |
| `.ms-chip-icon` | 22×22 koło, `flex:0 0 auto`, tło `#00838d1f`, tekst `#00535a` .65rem/700. |
| `.ms-chip-main` | Kolumna, `flex:1 1 auto`, `min-width:0`, `line-height:1.15`. |
| `.ms-chip-label` | .64rem/500, wersaliki, `letter-spacing:.04em`, `#5a7274`. |
| `.ms-chip-value` | .84rem/700, `#1a3536`, `line-height:1.2`. |
| `.ms-chip-badge` | .64rem/700, `padding:.12rem .38rem`, 999px, tło `#00838d24`, tekst `#00535a`, `nowrap`, `align-self:center`. |
| `.ms-chip--normal` | Obrys `#00838d47`, tło `#00838d0f`; etykieta i wartość `#00535a`; ikona i odznaka jak baza. |
| `.ms-chip--borderline` | Obrys `#c75d0047`, tło `#c75d000f`; ikona `#c75d001f`/`#7a3800`; teksty `#7a3800`; odznaka `#c75d0024`/`#7a3800`. |
| `.ms-chip--alert` | Obrys `#c628284d`, tło `#c628280f`; ikona `#c6282824`/`#7a1a1a`; teksty `#7a1a1a`; odznaka `#c6282824`/`#7a1a1a`. |
| `.ms-chip--neutral` | Obrys `#d0dede`, tło `#ffffff8c`; ikona `#5a72741a`/`#5a7274`; etykieta `#5a7274`, wartość `#1a3536`; odznaka `#5a72741a`/`#5a7274`. |

Brak stanów `:hover`/`:focus` (chip nie jest interaktywny). Szkło, wysoki kontrast i ciemne tło nie mają reguł dla `.ms-chip` — kolory są literałami i nie zmieniają się w motywach.

## Tokeny

Brak. Rodziny literałów: turkus `#00838d`/`#00535a`, bursztyn `#c75d00`/`#7a3800`, czerwień `#c62828`/`#7a1a1a`, szarość `#5a7274`/`#d0dede`/`#1a3536`.

## Zasady

- Rób: ton zawsze razem z odznaką centyla lub wartością — sam kolor obrysu nie mówi, czy wynik jest poza normą.
- Rób: litera ikony = pierwsza litera parametru w interfejsie (W waga, H wzrost, B BMI, S płeć); nie zamieniaj na ikonę SVG.
- Rób: jeden chip na parametr; brak danych = brak chipa, nie chip z „—”.
- Nie rób: nie osadzaj `.ms-chip` poza paskiem bocznym ani w układzie mobilnym (<992px pasek jest ukryty).
- Nie rób: nie dodawaj `title`/tooltipów z interpretacją kliniczną — chip jest skrótem, pełny wynik jest w karcie.
- Kontrast (zmierzony na białym tle): `#00535a`, `#7a3800`, `#7a1a1a` na tintach 6% mają 8,2–9,6:1, w odznakach 7,3–8,4:1; `#5a7274` w etykiecie 5,1:1 i na dysku ikony `.ms-chip--neutral` 4,5:1 przy .64–.65rem — nie zmniejszaj rozmiaru.

Wersja statyczna, przepisana ręcznie z src/css/sidebar.css (388-481, wewnątrz @media(min-width:992px) 3-487), custom-fixes.js (generator znacznika ms-chip)
